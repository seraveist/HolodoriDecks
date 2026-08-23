import assert from "node:assert/strict";

const productionUrl = process.env.PRODUCTION_URL || "https://holosims.net/";
const deploymentSha = String(process.env.DEPLOYMENT_SHA || "").trim();
const base = new URL(productionUrl);
const knownPortrait = "card-00010-5-uniq-0069-00";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!deploymentSha) throw new Error("DEPLOYMENT_SHA is required");

function withRevision(pathname, attempt = null) {
  const url = new URL(pathname, base);
  url.searchParams.set("v", deploymentSha);
  if (attempt !== null) url.searchParams.set("attempt", String(attempt));
  return url;
}

async function request(url) {
  return fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "Cache-Control": "no-cache" },
  });
}

async function waitForDeployment() {
  let last = "no response";
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    try {
      const response = await request(withRevision("/", attempt));
      const html = await response.text();
      const revisionMarker = `data-card-asset-revision="${deploymentSha}"`;
      const appMarker = `./js/app.js?v=${deploymentSha}`;
      if (response.ok && html.includes(revisionMarker) && html.includes(appMarker)) return html;
      last = `HTTP ${response.status}; revision=${html.includes(revisionMarker)}; app=${html.includes(appMarker)}`;
    } catch (error) {
      last = error.message;
    }
    console.log(`[production-smoke] waiting for deployment ${deploymentSha.slice(0, 12)} (${attempt}/36): ${last}`);
    await sleep(5_000);
  }
  throw new Error(`production did not expose deployment ${deploymentSha}: ${last}`);
}

const html = await waitForDeployment();
assert.ok(html.includes('class="calculation-scope"'), "calculation scope disclosure missing from production HTML");

const manifestResponse = await request(withRevision("/data/generated/manifest.json"));
assert.equal(manifestResponse.ok, true, `manifest request failed: ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
assert.match(String(manifest.source_commit || ""), /^[0-9a-f]{40}$/);
assert.ok(Number(manifest.card_count) >= 6, "manifest card count is invalid");
assert.ok(Number(manifest.music_count) > 0, "manifest music count is invalid");

const dataResponse = await request(withRevision("/js/data.js"));
assert.equal(dataResponse.ok, true, `data.js request failed: ${dataResponse.status}`);
const dataJs = await dataResponse.text();
for (const path of ["manifest.json", "cards.json", "characters.json", "music.json", "master_refs.json"]) {
  assert.ok(dataJs.includes(path), `production data.js lost ${path}`);
}
assert.ok(!dataJs.includes("manifest.js?v="), "production data.js contains corrupted manifest.js URL");
assert.ok(!dataJs.includes("cards.js?v="), "production data.js contains corrupted cards.js URL");

const cardsResponse = await request(withRevision("/js/ui/cards.js"));
assert.equal(cardsResponse.ok, true, `cards.js request failed: ${cardsResponse.status}`);
const cardsJs = await cardsResponse.text();
assert.ok(cardsJs.includes("dataset.cardAssetRevision"), "card portrait revision hook missing in production");

const portraitResponse = await request(withRevision(`/assets/cards/${knownPortrait}.webp`));
assert.equal(portraitResponse.ok, true, `known card portrait request failed: ${portraitResponse.status}`);
const portrait = Buffer.from(await portraitResponse.arrayBuffer());
assert.ok(portrait.length > 12, "known card portrait is empty");
assert.equal(portrait.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(portrait.subarray(8, 12).toString("ascii"), "WEBP");

console.log(`[production-smoke] OK ${base.origin} · ${deploymentSha.slice(0, 12)} · cards=${manifest.card_count} songs=${manifest.music_count}`);
