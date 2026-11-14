// Read-only investigation: never relabel an old timeline with a current asset hash.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EXACT_RUNTIME_SOURCE, scanChartObjects, validateRuntimeChart } from "./build-exact-runtime-index.mjs";
import { chartMetadataMatchesEntry, convertRuntimeChartObject } from "../js/chart-data.js";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const jsonDigest = value => digest(JSON.stringify(value));
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const micros = seconds => Math.round(seconds * 1_000_000);

// Pair notes within each type, ignoring simultaneous-note serialization order.
// The 1us bucket is diagnostic only; it never relaxes runtime admission.
export function compareNoteTimelines(before, after) {
  const types = [...new Set([...before, ...after].map(note => note[0]))].sort();
  let countDifferences = 0;
  let exactTimeDifferences = 0;
  let roundingOnlyDifferences = 0;
  let largerTimeDifferences = 0;
  let maxAbsDeltaMicroseconds = 0;
  const countsByType = {};
  const samples = [];
  for (const type of types) {
    const times = notes => notes.filter(note => note[0] === type).map(note => micros(note[1])).sort((a, b) => a - b);
    const oldTimes = times(before), currentTimes = times(after);
    countsByType[type] = { old: oldTimes.length, current: currentTimes.length };
    countDifferences += Math.abs(oldTimes.length - currentTimes.length);
    for (let index = 0; index < Math.min(oldTimes.length, currentTimes.length); index += 1) {
      const delta = currentTimes[index] - oldTimes[index];
      if (!delta) continue;
      exactTimeDifferences += 1;
      maxAbsDeltaMicroseconds = Math.max(maxAbsDeltaMicroseconds, Math.abs(delta));
      if (Math.abs(delta) <= 1) roundingOnlyDifferences += 1;
      else largerTimeDifferences += 1;
      if (samples.length < 8) samples.push({ type, indexWithinType: index, oldMicroseconds: oldTimes[index], currentMicroseconds: currentTimes[index], deltaMicroseconds: delta });
    }
  }
  return {
    pairing: "same-type chronological rank; not a proof of note identity",
    oldNotesSha256: jsonDigest(before), currentNotesSha256: jsonDigest(after),
    countsByType, countDifferences, exactTimeDifferences, roundingOnlyDifferences, largerTimeDifferences,
    maxAbsDeltaMicroseconds, samples,
  };
}

export async function auditRuntimeRejections({ input, root = process.cwd() }) {
  const bytes = await fs.readFile(input);
  if (digest(bytes) !== EXACT_RUNTIME_SOURCE.sha256) throw new Error("Pinned corpus SHA-256 mismatch");
  const corpus = JSON.parse(bytes.toString("utf8"));
  const generated = path.join(root, "data/generated");
  const [index, runtime, assets] = await Promise.all(["chart-index", "exact-runtime-index", "chart-assets"].map(name => readJson(path.join(generated, `${name}.json`))));
  if (runtime.currentMasterSourceCommit !== index.source_commit || assets.source_commit !== index.source_commit) throw new Error("Mixed master snapshots");
  const rows = scanChartObjects(bytes);
  const rejected = [];
  const compatibleKeys = new Set();
  for (const row of rows) {
    const source = row.chart;
    const key = `${source.songId}:${source.difficulty.toUpperCase()}`;
    const master = index.charts[key];
    const reasons = validateRuntimeChart(source, master);
    if (!reasons.length) { compatibleKeys.add(key); continue; }
    const asset = assets.charts[key];
    const localFile = master?.metadataPath ? path.resolve(generated, master.metadataPath) : null;
    const local = localFile ? await readJson(localFile) : null;
    const validLocal = chartMetadataMatchesEntry(local, master);
    // Convert against the SOURCE identity only, for comparison. This object is
    // never inserted into the current runtime index or written as Local Exact.
    const old = convertRuntimeChartObject(source, {
      musicId: source.songId, difficulty: source.difficulty.toUpperCase(),
      chartHash: source.upstreamChartHash, chartAssetId: source.chartAssetId,
      fullComboNoteCount: source.fullComboNoteCount, normalNoteCount: source.normalNoteCount,
    });
    rejected.push({
      key, reasons, decision: "keep-pinned-runtime-excluded",
      localExactAvailable: validLocal,
      currentSusDigestMatchesLocal: Boolean(local?.susSha256 && local.susSha256 === asset?.susSha256),
      sourceObjectSha256: row.sha256,
      old: {
        chartHash: source.upstreamChartHash, susSha256: source.source?.sus?.sha256 ?? null,
        source: source.source, fullComboNoteCount: source.fullComboNoteCount, normalNoteCount: source.normalNoteCount,
        skills: old.skills, fever: old.fever,
      },
      current: {
        chartHash: master?.chartHash ?? null, susSha256: asset?.susSha256 ?? null,
        fullComboNoteCount: master?.fullComboNoteCount ?? null, normalNoteCount: master?.normalNoteCount ?? null,
        metadataPath: master?.metadataPath ?? null, parserCommit: local?.parserCommit ?? null,
        converterCommit: local?.converterCommit ?? null, skills: local?.skills ?? null, fever: local?.fever ?? null,
      },
      comparison: validLocal ? {
        ...compareNoteTimelines(old.notes, local.notes),
        skillsEqual: JSON.stringify(old.skills) === JSON.stringify(local.skills),
        feverEqual: JSON.stringify(old.fever) === JSON.stringify(local.fever),
        skillTimeDeltasMicroseconds: local.skills.map((skill, i) => micros(skill.time) - micros(old.skills[i].time)),
        skillComboDeltas: local.skills.map((skill, i) => skill.combo - old.skills[i].combo),
      } : null,
    });
  }
  const publishedKeys = Object.keys(runtime.charts).sort();
  if (JSON.stringify(publishedKeys) !== JSON.stringify([...compatibleKeys].sort())
    || runtime.runtimeExactCount !== compatibleKeys.size
    || runtime.rejectedAvailableCount !== rejected.length
    || JSON.stringify(runtime.rejectedAvailable) !== JSON.stringify(rejected.map(({ key, reasons }) => ({ key, reasons })))) throw new Error("Runtime index differs from pinned-corpus validation");
  const localKeys = new Set();
  for (const [key, entry] of Object.entries(index.charts)) {
    if (entry.metadataPath && chartMetadataMatchesEntry(await readJson(path.resolve(generated, entry.metadataPath)), entry)) localKeys.add(key);
  }
  const availableKeys = new Set(rows.map(({ chart }) => `${chart.songId}:${chart.difficulty.toUpperCase()}`));
  const unavailable = corpus.unavailableCharts.map(chart => ({ key: `${chart.songId}:${chart.difficulty.toUpperCase()}`, reason: chart.reason }));
  const unavailableKeys = new Set(unavailable.map(chart => chart.key));
  const outsideCorpus = Object.keys(index.charts).filter(key => !availableKeys.has(key) && !unavailableKeys.has(key));
  const union = new Set([...localKeys, ...compatibleKeys]);
  return {
    version: 1, source: EXACT_RUNTIME_SOURCE,
    master: { sourceCommit: index.source_commit, masterVersion: assets.master_version, catalogRevision: assets.catalogRevision },
    coverage: {
      masterCharts: index.chart_count, runtimeExact: compatibleKeys.size, localExact: localKeys.size,
      overlap: [...localKeys].filter(key => compatibleKeys.has(key)).length,
      combinedExact: union.size, withoutExact: index.chart_count - union.size,
      rejectedRuntime: rejected.length, rejectedWithLocalExact: rejected.filter(row => row.localExactAvailable).length,
      newlyRecoveredRuntime: 0, newlyRecoveredCombined: 0,
      sourceUnavailable: unavailable.length,
      sourceUnavailableWithLocalExact: unavailable.filter(row => localKeys.has(row.key)).length,
      masterKeysOutsideCorpus: outsideCorpus.length,
    },
    rejected,
    // This is a separate intake-status list, not part of the five hash failures.
    sourceUnavailable: unavailable,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--input") options.input = args[++i];
    else if (args[i] === "--output") options.output = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!options.input || !options.output) throw new Error("Usage: node scripts/audit-exact-runtime-rejections.mjs --input <pinned-corpus.json> --output <report.json>");
  const report = await auditRuntimeRejections(options);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.coverage));
}
if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "")) main().catch(error => { console.error(error); process.exitCode = 1; });
