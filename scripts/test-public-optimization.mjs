import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { encodeCards, decodeCards } from "../js/data-codec.js";
import { dataAssetRequest } from "../js/data-assets.js";
import { createChartResourcesLoader } from "../js/chart-data.js";
import { loadAppData } from "../js/data.js";
import { prepareScoreCards } from "../js/card-prepare.js";
import { buildPublicAssets } from "./build-public-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async name => JSON.parse(await readFile(path.join(root, "data/generated", name), "utf8"));
const cards = await read("cards.json");
const original = JSON.stringify(cards);
const packed = encodeCards(cards);
const decoded = decodeCards(JSON.parse(JSON.stringify(packed)));
assert.deepStrictEqual(decoded, cards);
assert.equal(JSON.stringify(cards), original, "encoding must not mutate source rows");
assert.equal(decodeCards(cards), cards, "legacy array support");
assert.equal(packed.tables.levels.length, new Set(cards.map(c => JSON.stringify(c.growth.levels))).size);
assert.ok(packed.tables.levels.length < cards.length);
const duplicate = packed.cards.findIndex((c, i) => i > 0 && c.growth.levels === packed.cards[0].growth.levels);
assert.ok(duplicate > 0);
const untouched = JSON.stringify(decoded[duplicate]);
decoded[0].growth.levels[0].level = -123;
assert.equal(JSON.stringify(decoded[duplicate]), untouched, "decoded cards must not share mutable tables");
assert.equal(JSON.stringify(cards), original);
for (const bad of [null, {}, { ...packed, version: 99 }, { ...packed, tables: {} }]) {
  assert.throws(() => decodeCards(bad));
}
for (const index of [-1, 1.5, 999999, "0", null]) {
  const bad = structuredClone(packed);
  bad.cards[0].growth.levels = index;
  assert.throws(() => decodeCards(bad));
}
const divergent = structuredClone(cards.slice(0, 2));
divergent[1].growth.level_group_id = divergent[0].growth.level_group_id;
divergent[1].growth.levels[0].level = 54321;
assert.deepStrictEqual(decodeCards(encodeCards(divergent)), divergent,
  "deduplicate by actual content, never just by group ID");

const characters = new Map((await read("characters.json")).map(c => [c.id, c]));
const masterRefs = await read("master_refs.json");
for (const mode of ["current", "max"]) {
  for (let potential = 0; potential <= 5; potential++) {
    for (const minimum of [true, false]) {
      const profiles = Object.fromEntries(cards.map(card => [card.id, {
        level: minimum ? 1 : Math.max(...card.growth.levels.map(row => row.level)), potential,
      }]));
      assert.deepStrictEqual(
        prepareScoreCards(decodeCards(structuredClone(packed)), characters, profiles, { levelMode: mode, masterRefs }),
        prepareScoreCards(cards, characters, profiles, { levelMode: mode, masterRefs }),
        `score preparation drift: ${mode}, potential=${potential}, minimum=${minimum}`);
    }
  }
}

const cardsUrl = new URL("../data/generated/cards.json", import.meta.url);
const hash = "a".repeat(64);
const manifest = await read("manifest.json");
const publicManifest = { ...manifest, public_assets: { version: 1, files: { "cards.json": `runtime/cards.${hash}.json` } } };
assert.equal(dataAssetRequest(cardsUrl, publicManifest).cache, "force-cache");
assert.equal(dataAssetRequest(cardsUrl, manifest).cache, "no-store");
assert.equal(dataAssetRequest(cardsUrl, manifest).url.searchParams.get("v"), manifest.source_commit);
for (const value of ["../cards.json", "https://example.invalid/cards.json", "runtime/cards.latest.json", 3]) {
  const bad = { ...manifest, public_assets: { version: 1, files: { "cards.json": value } } };
  assert.throws(() => dataAssetRequest(cardsUrl, bad));
}
assert.throws(() => dataAssetRequest(cardsUrl, { ...publicManifest, public_assets: { ...publicManifest.public_assets, version: 2 } }));
const requests = [];
const savedFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    const name = path.basename(url.pathname);
    const payload = name.startsWith("cards.") ? packed : name === "music-search.json" ? null : await read(name);
    return new Response(JSON.stringify(payload), { status: payload === null ? 404 : 200 });
  };
  const data = await loadAppData(publicManifest);
  assert.deepStrictEqual(data.cards, cards);
  assert.equal(data.cardsById.size, cards.length);
  assert.equal(requests.find(x => x.url.pathname.includes("/runtime/cards.")).options.cache, "force-cache");
} finally { globalThis.fetch = savedFetch; }

let calls = 0;
let release;
const resource = { index: { chart_count: 2 }, scoreRules: {}, chartsByKey: new Map() };
const ensure = createChartResourcesLoader({}, () => { calls++; return new Promise(resolve => { release = resolve; }); });
assert.equal(calls, 0, "creating loader must not start network work");
const first = ensure();
const second = ensure();
assert.equal(first, second);
await Promise.resolve();
assert.equal(calls, 1);
release(resource);
assert.equal(await first, resource);
assert.equal(await ensure(), resource);
assert.equal(calls, 1);
let failures = 0;
const retry = createChartResourcesLoader({}, async () => { if (++failures === 1) throw new Error("offline"); return resource; });
await assert.rejects(retry(), /offline/);
assert.equal(await retry(), resource);
let misses = 0;
const retryEmpty = createChartResourcesLoader({}, async () => ++misses === 1 ? { index: { chart_count: 0 } } : resource);
await retryEmpty();
assert.equal(await retryEmpty(), resource);

const temp = await mkdtemp(path.join(tmpdir(), "holodori-public-assets-"));
try {
  for (const name of ["index.html", "styles.css", "css", "js", "data/generated"]) {
    await cp(path.join(root, name), path.join(temp, name), { recursive: true });
  }
  const oldCards = await readFile(path.join(temp, "data/generated/cards.json"));
  const report = await buildPublicAssets(temp);
  const nextManifest = JSON.parse(await readFile(path.join(temp, "data/generated/manifest.json"), "utf8"));
  assert.deepStrictEqual(await readFile(path.join(temp, "data/generated/cards.json")), oldCards,
    "backward-compatible raw data and source files stay untouched");
  for (const [logicalName, runtimeName] of Object.entries(nextManifest.public_assets.files)) {
    const bytes = await readFile(path.join(temp, "data/generated", runtimeName));
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(runtimeName.includes(hash));
    if (logicalName === "cards.json") assert.deepStrictEqual(decodeCards(JSON.parse(bytes)), cards);
    else assert.deepStrictEqual(JSON.parse(bytes), await read(logicalName));
  }
  const html = await readFile(path.join(temp, "index.html"), "utf8");
  assert.equal((html.match(/href="\.\/[^" ]+\.css/g) || []).length, 1);
  assert.ok(html.includes('name="google-site-verification"'));
  assert.ok(html.includes('data-i18n="app.name"'));
  assert.ok(html.includes('type="module"'));
  assert.ok(!/<script\b[^>]*type=["']application\/json/.test(html));
  const css = await readFile(path.join(temp, report.css.file), "utf8");
  assert.ok(!/@import\s/.test(css));
  const again = await buildPublicAssets(temp);
  assert.deepStrictEqual(again, report, "public build must be deterministic and repeatable");
  const runtimeBytes = await readFile(path.join(temp, "data/generated", nextManifest.public_assets.files["cards.json"]));
  console.log(JSON.stringify({ cards: cards.length, preparationConfigurations: 24,
    sourceBytes: oldCards.length, runtimeBytes: runtimeBytes.length,
    gzipSource: gzipSync(oldCards, { level: 9 }).length,
    gzipRuntime: gzipSync(runtimeBytes, { level: 9 }).length,
    css: report.css, runtimeAssets: Object.keys(nextManifest.public_assets.files).length }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
console.log("[public-optimization] roundtrip, preparation parity, cache safety, lazy loading and build regressions passed");
