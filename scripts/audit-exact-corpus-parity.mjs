import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { convertCorpusChart, DEFAULT_SOURCE_COMMIT, DEFAULT_SOURCE_PATH, DEFAULT_SOURCE_REPOSITORY } from "./import-exact-chart-corpus.mjs";
import { songKernel } from "../js/chart-score.js";

const sourceArg = process.argv.find((value) => value.startsWith("--source="));
if (!sourceArg) throw new Error("--source=<path> is required");
const sourceFile = sourceArg.slice("--source=".length);

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const normalizeType = (value) => String(value ?? "").replace(/^critical_/, "").replace(/^normal$/, "tap");

const [corpus, chartIndex, existing, rules] = await Promise.all([
  readJson(sourceFile),
  readJson("data/generated/chart-index.json"),
  readJson("data/generated/charts/m0049-EXPERT.json"),
  readJson("data/generated/live-score-rules.json"),
]);
const sourceChart = corpus.charts.find((chart) => chart.songId === "m0049" && String(chart.difficulty).toLowerCase() === "expert");
if (!sourceChart) throw new Error("m0049:expert missing from corpus");
const localChart = chartIndex.charts["m0049:EXPERT"];
if (!localChart) throw new Error("m0049:EXPERT missing from local chart index");
const converted = convertCorpusChart(sourceChart, localChart, {
  repository: DEFAULT_SOURCE_REPOSITORY,
  commit: DEFAULT_SOURCE_COMMIT,
  path: DEFAULT_SOURCE_PATH,
  schemaVersion: corpus.schemaVersion,
  transformVersion: corpus.transformVersion,
  apiRevision: corpus.sourceSnapshot?.apiRevision ?? null,
  retrievedAt: corpus.retrievedAt ?? null,
});

function byType(metadata) {
  const result = new Map();
  for (const note of metadata.notes ?? []) {
    const type = normalizeType(note[0]);
    const rows = result.get(type) ?? [];
    rows.push(Number(note[1]));
    result.set(type, rows);
  }
  for (const rows of result.values()) rows.sort((a, b) => a - b);
  return result;
}

const left = byType(existing);
const right = byType(converted);
const types = [...new Set([...left.keys(), ...right.keys()])].sort();
const typeDiffs = [];
let maxAbsTimeDeltaSec = 0;
let timeDeltaOverOneMs = 0;
for (const type of types) {
  const a = left.get(type) ?? [];
  const b = right.get(type) ?? [];
  const count = Math.min(a.length, b.length);
  let typeMaxDelta = 0;
  for (let index = 0; index < count; index += 1) {
    const delta = Math.abs(a[index] - b[index]);
    typeMaxDelta = Math.max(typeMaxDelta, delta);
    maxAbsTimeDeltaSec = Math.max(maxAbsTimeDeltaSec, delta);
    if (delta > 0.001) timeDeltaOverOneMs += 1;
  }
  typeDiffs.push({ type, existing: a.length, corpus: b.length, maxAbsTimeDeltaSec: typeMaxDelta });
}

function kernel(metadata, mode) {
  return songKernel({
    notes: metadata.notes.length,
    coefficient: 5,
    noteTimeline: metadata.notes,
  }, mode, rules);
}

const report = {
  noteCount: { existing: existing.notes.length, corpus: converted.notes.length },
  typeDiffs,
  maxAbsTimeDeltaSec,
  timeDeltaOverOneMs,
  skillsMatch: JSON.stringify(existing.skills) === JSON.stringify(converted.skills),
  feverMatch: JSON.stringify(existing.fever) === JSON.stringify(converted.fever),
  manualKernel: { existing: kernel(existing, "manual"), corpus: kernel(converted, "manual") },
  autoKernel: { existing: kernel(existing, "auto"), corpus: kernel(converted, "auto") },
};
report.manualKernel.delta = report.manualKernel.corpus - report.manualKernel.existing;
report.autoKernel.delta = report.autoKernel.corpus - report.autoKernel.existing;
console.log(JSON.stringify(report, null, 2));
