import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { compareNoteTimelines } from "./audit-exact-runtime-rejections.mjs";
import { validateRuntimeChart } from "./build-exact-runtime-index.mjs";
import { chartMetadataMatchesEntry, loadSelectedChart, runtimeEntryMatchesChart } from "../js/chart-data.js";

const read = async name => JSON.parse(await fs.readFile(new URL(name, import.meta.url), "utf8"));
const types = ["tap", "flick", "long_start", "long_end", "long_flick_end", "long_continuation", "long_relay"];
const [report, index, runtime, assets] = await Promise.all([
  "../analysis/exact-runtime-hash-audit-20261021.json", "../data/generated/chart-index.json",
  "../data/generated/exact-runtime-index.json", "../data/generated/chart-assets.json",
].map(read));
assert.deepEqual(report.rejected.map(row => row.key).sort(), [
  "m0066:EXPERT", "m0337:EASY", "m0337:EXPERT", "m0337:HARD", "m0337:NORMAL",
]);

// Serialization order and 1us rounding are diagnosed separately from changes.
const notes = [["tap", 1], ["flick", 1], ["tap", 2]];
assert.equal(compareNoteTimelines(notes, [notes[1], notes[0], notes[2]]).exactTimeDifferences, 0);
const rounding = compareNoteTimelines(notes, [notes[0], notes[1], ["tap", 2.000001]]);
assert.equal(rounding.roundingOnlyDifferences, 1);
assert.equal(rounding.largerTimeDifferences, 0);
assert.equal(compareNoteTimelines(notes, [notes[0], notes[1], ["tap", 2.2]]).largerTimeDifferences, 1);
assert.equal(compareNoteTimelines(notes, [notes[0], notes[1], ["critical_tap", 2]]).countDifferences, 2);

const originalFetch = globalThis.fetch;
try {
  for (const row of report.rejected) {
    const entry = index.charts[row.key];
    const local = await read(`../data/generated/${entry.metadataPath}`);
    assert.equal(chartMetadataMatchesEntry(local, entry), true, `${row.key}: valid current Local Exact required`);
    assert.equal(local.susSha256, assets.charts[row.key].susSha256);

    // Counterfactual: even copying a valid current timeline cannot make the
    // old source hash acceptable. This is not a reconstructed old source.
    const staleEntry = { ...entry, chartHash: row.old.chartHash };
    assert.equal(runtimeEntryMatchesChart(staleEntry, entry), false);
    const oldSource = {
      upstreamChartHash: row.old.chartHash, chartAssetId: entry.chartAssetId,
      fullComboNoteCount: entry.fullComboNoteCount, normalNoteCount: entry.normalNoteCount,
      events: local.notes.map(([type, time]) => [Math.round(time * 1e6), types.indexOf(type.replace(/^critical_/, "")), type.startsWith("critical_") ? 1 : 0]),
      specialMarkerMicroseconds: local.skills.map(skill => Math.round(skill.time * 1e6)),
      specialStartsAtCombo: local.skills.map(skill => skill.combo),
    };
    assert.deepEqual(validateRuntimeChart(oldSource, entry), ["chart-hash-mismatch"]);

    // Keep this historical fixture useful across additive future master syncs.
    // A genuinely new current hash may supply its own newly validated source.
    if (entry.chartHash === row.current.chartHash) {
      assert.equal(runtime.charts[row.key], undefined, `${row.key}: never admit this old source`);
      assert.deepEqual(runtime.rejectedAvailable.find(item => item.key === row.key)?.reasons, ["chart-hash-mismatch"]);
      assert.equal(createHash("sha256").update(JSON.stringify(local.notes)).digest("hex"), row.comparison.currentNotesSha256);
      assert.deepEqual(local.skills, row.current.skills);
      assert.deepEqual(local.fever, row.current.fever);
    }

    let requests = 0;
    let responseMetadata = local;
    globalThis.fetch = async url => {
      requests += 1;
      assert.match(String(url), new RegExp(entry.metadataPath.slice(2).replaceAll(".", "\\.")));
      return { ok: true, json: async () => responseMetadata };
    };
    const resources = {
      version: index.source_commit, chartsByKey: new Map([[row.key, entry]]),
      runtimeIndex: runtime,
      // Even if a stale entry were accidentally present, reject it before fetch.
      runtimeChartsByKey: new Map([[row.key, staleEntry]]),
    };
    const selected = await loadSelectedChart(resources, entry.musicId, entry.difficulty);
    assert.deepEqual(selected.metadata, local);
    assert.equal(requests, 1, `${row.key}: use Local Exact without fetching the old corpus`);
    for (const broken of [{ ...local, chartHash: row.old.chartHash }, { ...local, skills: local.skills.slice(1) }]) {
      responseMetadata = broken;
      requests = 0;
      const fallback = await loadSelectedChart(resources, entry.musicId, entry.difficulty);
      assert.equal(fallback.metadata, null, `${row.key}: invalid Local Exact must fall back safely`);
      assert.equal(requests, 1, `${row.key}: never fetch a stale Runtime source`);
    }
  }
} finally { globalThis.fetch = originalFetch; }
console.log("exact runtime hash rejections: five current Local Exact paths, stale-source rejection and safe fallback passed");
