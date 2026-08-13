import { createHash } from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
import {
  chartKey,
  convertRuntimeChartObject,
  loadSelectedChart,
  runtimeEntryMatchesChart,
} from "../js/chart-data.js";

const chartEntry = {
  musicId: "mtest",
  difficulty: "EXPERT",
  chartHash: "hash-test",
  chartAssetId: "chart_mtest_expert",
  fullComboNoteCount: 3,
  normalNoteCount: 2,
  metadataPath: null,
};
const sourceChart = {
  songId: "mtest",
  difficulty: "expert",
  upstreamChartHash: "hash-test",
  chartAssetId: "chart_mtest_expert",
  fullComboNoteCount: 3,
  normalNoteCount: 2,
  events: [
    [1_000_000, 0, 0],
    [2_000_000, 0, 1],
    [3_000_000, 1, 0],
  ],
  specialMarkerMicroseconds: [500_000, 1_500_000, 2_500_000, 3_500_000, 4_500_000],
  specialStartsAtCombo: [0, 1, 2, 3, 3],
  feverMarkerMicroseconds: {
    chargeStart: 2_000_000,
    chargeEnd: 2_500_000,
    feverStart: 3_000_000,
    feverEnd: 4_000_000,
  },
  source: {
    sus: { sha256: "sus-sha" },
    metadata: { sha256: "metadata-sha" },
  },
};

assert.equal(chartKey("mtest", "expert"), "mtest:EXPERT");
assert.equal(runtimeEntryMatchesChart({ ...chartEntry }, chartEntry), true);
assert.equal(runtimeEntryMatchesChart({ ...chartEntry, chartHash: "other" }, chartEntry), false);

const converted = convertRuntimeChartObject(sourceChart, chartEntry);
assert.deepEqual(converted.notes, [
  ["tap", 1],
  ["critical_tap", 2],
  ["flick", 3],
]);
assert.equal(converted.skills.length, 5);
assert.deepEqual(converted.skills[0], { slot: 1, time: 0.5, combo: 0 });
assert.deepEqual(converted.fever, { start: 3, end: 4 });
assert.deepEqual(converted.feverCharge, { start: 2, end: 2.5 });
assert.equal(converted.sourceRuntime, true);

assert.throws(() => convertRuntimeChartObject({
  ...sourceChart,
  events: [[1_000_000, 7, 0], [2_000_000, 0, 0], [3_000_000, 1, 0]],
}, chartEntry), /unsupported runtime note type/);
assert.throws(() => convertRuntimeChartObject({ ...sourceChart, upstreamChartHash: "stale" }, chartEntry), /chart hash mismatch/);

const sourceText = JSON.stringify(sourceChart);
let requests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  requests += 1;
  assert.equal(String(url), "https://example.test/pinned.json");
  assert.equal(options.headers?.Range, `bytes=10-${10 + Buffer.byteLength(sourceText) - 1}`);
  return {
    status: 206,
    headers: { get: (name) => String(name).toLowerCase() === "content-range" ? `bytes=10-${10 + Buffer.byteLength(sourceText) - 1}/${10 + Buffer.byteLength(sourceText)}`.replace("bytes=", "bytes ") : null },
    text: async () => sourceText,
    body: { cancel: async () => {} },
  };
};

try {
  const runtimeEntry = {
    ...chartEntry,
    start: 10,
    end: 10 + Buffer.byteLength(sourceText) - 1,
    length: Buffer.byteLength(sourceText),
    objectSha256: createHash("sha256").update(sourceText).digest("hex"),
  };
  const resources = {
    version: "test",
    chartsByKey: new Map([["mtest:EXPERT", chartEntry]]),
    runtimeIndex: { source: { url: "https://example.test/pinned.json" } },
    runtimeChartsByKey: new Map([["mtest:EXPERT", runtimeEntry]]),
  };
  const result = await loadSelectedChart(resources, "mtest", "EXPERT");
  assert.equal(requests, 1);
  assert.equal(result.metadata.sourceRuntime, true);
  assert.equal(result.metadata.notes.length, 3);

  const staleResources = {
    ...resources,
    runtimeChartsByKey: new Map([["mtest:EXPERT", { ...runtimeEntry, chartHash: "stale" }]]),
  };
  const stale = await loadSelectedChart(staleResources, "mtest", "EXPERT");
  assert.equal(requests, 1, "stale range entry should be rejected before network access");
  assert.equal(stale.metadata, null);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("exact runtime source tests: OK");


const actualRuntime = JSON.parse(fs.readFileSync(new URL("../data/generated/exact-runtime-index.json", import.meta.url), "utf8"));
const actualCharts = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
assert.equal(actualRuntime.currentMasterSourceCommit, actualCharts.source_commit);
assert.equal(actualRuntime.currentMasterChartCount, actualCharts.chart_count);
assert.equal(actualRuntime.runtimeExactCount, Object.keys(actualRuntime.charts ?? {}).length);
for (const [key, runtime] of Object.entries(actualRuntime.charts ?? {})) {
  assert.equal(runtimeEntryMatchesChart(runtime, actualCharts.charts?.[key]), true, `${key}: runtime/master mismatch`);
}
console.log(`exact runtime index coherence: ${actualRuntime.runtimeExactCount}/${actualRuntime.currentMasterChartCount}`);
