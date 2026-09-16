import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeCards, decodeCards } from "../js/data-codec.js";
import assert from "node:assert/strict";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function buildPublicAssets(root) {
  root = path.resolve(root);
  if (root === repository) throw new Error("Build into a copied public artifact, not repository sources");
  const generated = path.join(root, "data/generated");
  const manifestPath = path.join(generated, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const runtime = path.join(generated, "runtime");
  await rm(runtime, { recursive: true, force: true });
  await mkdir(runtime, { recursive: true });
  const files = {};
  const sizes = {};
  const logicalFiles = [
    "cards.json", "characters.json", "music.json", "music-search.json", "master_refs.json",
    "boards.json", "memory-bonuses.json", "i18n/boards/ko.json", "i18n/boards/en.json", "i18n/boards/ja.json",
    "chart-index.json", "live-score-rules.json", "exact-runtime-index.json",
    "i18n/ko.json", "i18n/en.json", "i18n/ja.json",
  ];
  for (const name of logicalFiles) {
    let source;
    try { source = await readFile(path.join(generated, name)); }
    catch (error) {
      if (error.code === "ENOENT" && name === "music-search.json") continue;
      throw error;
    }
    const original = JSON.parse(source.toString("utf8"));
    const data = name === "cards.json" ? encodeCards(original) : original;
    const serialized = Buffer.from(JSON.stringify(data));
    if (name === "cards.json") {
      assert.deepStrictEqual(decodeCards(JSON.parse(serialized.toString("utf8"))), original,
        "Public card transport must reconstruct every original field");
    }
    const hash = createHash("sha256").update(serialized).digest("hex");
    const filename = `${name.slice(0, -5).replaceAll("/", "-")}.${hash}.json`;
    files[name] = `runtime/${filename}`;
    await writeFile(path.join(runtime, filename), serialized);
    sizes[name] = { source: source.length, public: serialized.length, sha256: hash };
  }
  // Legacy logical paths remain for older clients; new clients use immutable files.
  // The small, mutable manifest is always fetched fresh by loadManifest().
  manifest.public_assets = { version: 1, files };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "py" : "python3");
  const css = spawnSync(python, [path.join(repository, "scripts/build-public-css.py"), "--root", root], { encoding: "utf8" });
  if (css.status !== 0) throw new Error(`Public CSS build failed: ${css.stderr || css.error || css.status}`);
  const cssReport = JSON.parse(css.stdout.trim());
  return { data: sizes, css: cssReport };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--root");
  if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node scripts/build-public-assets.mjs --root <copied-site>");
  console.log(JSON.stringify(await buildPublicAssets(process.argv[index + 1]), null, 2));
}
