import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_CHART_INDEX = path.join(ROOT, "data", "generated", "chart-index.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "generated", "exact-runtime-index.json");

export const EXACT_RUNTIME_SOURCE = Object.freeze({
  repository: "asciisyaez/yagoo-dori",
  commit: "6c2c95d52c268862d34fb523d965f09a3108bbbd",
  path: "data/generated/holodori-chart-timelines.json",
  url: "https://raw.githubusercontent.com/asciisyaez/yagoo-dori/6c2c95d52c268862d34fb523d965f09a3108bbbd/data/generated/holodori-chart-timelines.json",
  sha256: "0c34e934a20e29e5ded8140ab31d12617f832ed723d2b56e535d3db19c276534",
  sourceId: "holodori-best-chart-corpus-r51",
  apiRevision: 51,
  retrievedAt: "2026-08-02",
  sourceLicense: null,
});

const NOTE_TYPE_COUNT = 8;
const DAMAGE_NOTE_TYPE = 7;
const BYTE = Object.freeze({
  quote: 0x22,
  backslash: 0x5c,
  openBrace: 0x7b,
  closeBrace: 0x7d,
  openBracket: 0x5b,
  closeBracket: 0x5d,
  comma: 0x2c,
  colon: 0x3a,
});

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { input: null, chartIndex: DEFAULT_CHART_INDEX, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.input = argv[++index];
    else if (arg === "--chart-index") options.chartIndex = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/build-exact-runtime-index.mjs --input <pinned-corpus.json> [--output data/generated/exact-runtime-index.json]");
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  if (!options.input) fail("--input <pinned-corpus.json> is required");
  return options;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isWhitespace(value) {
  return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d;
}

function findChartsArrayStart(bytes) {
  const marker = Buffer.from('"charts"');
  const markerIndex = bytes.indexOf(marker);
  if (markerIndex < 0) fail("Corpus charts property not found");
  let cursor = markerIndex + marker.length;
  while (cursor < bytes.length && isWhitespace(bytes[cursor])) cursor += 1;
  if (bytes[cursor] !== BYTE.colon) fail("Corpus charts property has no colon");
  cursor += 1;
  while (cursor < bytes.length && isWhitespace(bytes[cursor])) cursor += 1;
  if (bytes[cursor] !== BYTE.openBracket) fail("Corpus charts property is not an array");
  return cursor + 1;
}

export function scanChartObjects(bytes) {
  const result = [];
  let cursor = findChartsArrayStart(bytes);
  while (cursor < bytes.length) {
    while (cursor < bytes.length && (isWhitespace(bytes[cursor]) || bytes[cursor] === BYTE.comma)) cursor += 1;
    if (bytes[cursor] === BYTE.closeBracket) break;
    if (bytes[cursor] !== BYTE.openBrace) fail(`Expected chart object at byte ${cursor}`);
    const start = cursor;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (; cursor < bytes.length; cursor += 1) {
      const value = bytes[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (value === BYTE.backslash) escaped = true;
        else if (value === BYTE.quote) inString = false;
        continue;
      }
      if (value === BYTE.quote) {
        inString = true;
        continue;
      }
      if (value === BYTE.openBrace) depth += 1;
      else if (value === BYTE.closeBrace) {
        depth -= 1;
        if (depth === 0) {
          end = cursor;
          cursor += 1;
          break;
        }
      }
    }
    if (end < 0) fail(`Unterminated chart object starting at byte ${start}`);
    const objectBytes = bytes.subarray(start, end + 1);
    result.push({
      start,
      end,
      length: end - start + 1,
      sha256: sha256(objectBytes),
      chart: JSON.parse(objectBytes.toString("utf8")),
    });
  }
  return result;
}

function sourceChartKey(chart) {
  return `${String(chart?.songId ?? "")}:${String(chart?.difficulty ?? "").toUpperCase()}`;
}

export function validateRuntimeChart(chart, masterChart) {
  const reasons = [];
  if (!masterChart) return ["missing-current-master-chart"];
  if (String(chart?.upstreamChartHash ?? "") !== String(masterChart?.chartHash ?? "")) reasons.push("chart-hash-mismatch");
  if (Number(chart?.fullComboNoteCount) !== Number(masterChart?.fullComboNoteCount)) reasons.push("full-combo-mismatch");
  if (chart?.chartAssetId && masterChart?.chartAssetId && String(chart.chartAssetId) !== String(masterChart.chartAssetId)) reasons.push("chart-asset-id-mismatch");
  if (Number(chart?.normalNoteCount) !== Number(masterChart?.normalNoteCount)) reasons.push("normal-note-count-mismatch");
  if (!Array.isArray(chart?.events) || chart.events.length !== Number(chart?.fullComboNoteCount)) reasons.push("event-count-mismatch");
  if (!Array.isArray(chart?.specialMarkerMicroseconds) || chart.specialMarkerMicroseconds.length !== 5
    || !Array.isArray(chart?.specialStartsAtCombo) || chart.specialStartsAtCombo.length !== 5) reasons.push("invalid-special-markers");
  if (Array.isArray(chart?.specialMarkerMicroseconds)
    && chart.specialMarkerMicroseconds.some((time, index, rows) => index > 0 && Number(time) <= Number(rows[index - 1]))) reasons.push("non-chronological-special-markers");
  if (Array.isArray(chart?.events)
    && chart.events.some((event, index, rows) => index > 0 && Number(event?.[0]) < Number(rows[index - 1]?.[0]))) reasons.push("non-chronological-events");
  if (Array.isArray(chart?.events) && chart.events.some((event) => {
    const type = Number(event?.[1]);
    return !Number.isInteger(type) || type < 0 || type >= NOTE_TYPE_COUNT;
  })) reasons.push("unknown-note-type-code");
  if (Array.isArray(chart?.events) && chart.events.some((event) => Number(event?.[1]) === DAMAGE_NOTE_TYPE)) reasons.push("unsupported-damage-events");
  return reasons;
}

export async function buildExactRuntimeIndex({ input, chartIndexFile = DEFAULT_CHART_INDEX, output = DEFAULT_OUTPUT } = {}) {
  if (!input) fail("input is required");
  const [bytes, chartIndex] = await Promise.all([
    fs.readFile(input),
    readJson(chartIndexFile),
  ]);
  const inputSha = sha256(bytes);
  if (inputSha !== EXACT_RUNTIME_SOURCE.sha256) fail(`Corpus SHA-256 mismatch: ${inputSha}`);

  const corpus = JSON.parse(bytes.toString("utf8"));
  if (Number(corpus?.schemaVersion) !== 1) fail(`Unexpected corpus schemaVersion: ${corpus?.schemaVersion}`);
  if (String(corpus?.sourceSnapshot?.id ?? "") !== EXACT_RUNTIME_SOURCE.sourceId) fail(`Unexpected source id: ${corpus?.sourceSnapshot?.id}`);
  if (Number(corpus?.sourceSnapshot?.apiRevision) !== EXACT_RUNTIME_SOURCE.apiRevision) fail(`Unexpected API revision: ${corpus?.sourceSnapshot?.apiRevision}`);
  if (String(corpus?.retrievedAt ?? "") !== EXACT_RUNTIME_SOURCE.retrievedAt) fail(`Unexpected retrieval date: ${corpus?.retrievedAt}`);

  const masterCharts = chartIndex?.charts ?? {};
  const entries = {};
  const rejected = [];
  const scanned = scanChartObjects(bytes);
  for (const row of scanned) {
    const key = sourceChartKey(row.chart);
    const masterChart = masterCharts[key];
    const reasons = validateRuntimeChart(row.chart, masterChart);
    if (reasons.length) {
      rejected.push({ key, reasons });
      continue;
    }
    entries[key] = {
      start: row.start,
      end: row.end,
      length: row.length,
      objectSha256: row.sha256,
      musicId: masterChart.musicId,
      difficulty: masterChart.difficulty,
      chartHash: masterChart.chartHash ?? null,
      chartAssetId: masterChart.chartAssetId ?? null,
      fullComboNoteCount: Number(masterChart.fullComboNoteCount) || 0,
      normalNoteCount: Number(masterChart.normalNoteCount) || 0,
    };
  }

  const unavailable = Array.isArray(corpus?.unavailableCharts) ? corpus.unavailableCharts : [];
  const unavailableReasons = {};
  for (const chart of unavailable) {
    const reason = String(chart?.reason ?? "unknown");
    unavailableReasons[reason] = (unavailableReasons[reason] ?? 0) + 1;
  }

  const payload = {
    version: 1,
    source: EXACT_RUNTIME_SOURCE,
    sourceSchemaVersion: Number(corpus.schemaVersion),
    sourceTransformVersion: corpus.transformVersion ?? null,
    currentMasterSourceCommit: chartIndex.source_commit ?? null,
    currentMasterChartCount: Number(chartIndex.chart_count) || Object.keys(masterCharts).length,
    runtimeExactCount: Object.keys(entries).length,
    unavailableCount: unavailable.length,
    unavailableReasons,
    rejectedAvailableCount: rejected.length,
    rejectedAvailable: rejected,
    charts: entries,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = await buildExactRuntimeIndex({
    input: path.resolve(options.input),
    chartIndexFile: path.resolve(options.chartIndex),
    output: path.resolve(options.output),
  });
  console.log(`exact-runtime-index: ${payload.runtimeExactCount}/${payload.currentMasterChartCount} compatible charts, ${payload.unavailableCount} unavailable, ${payload.rejectedAvailableCount} rejected`);
  if (payload.rejectedAvailableCount) process.exitCode = 2;
}

if (import.meta.url === new URL(`file://${path.resolve(process.argv[1] ?? "")}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
