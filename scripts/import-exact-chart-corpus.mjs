import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const GENERATED = path.join(ROOT, "data", "generated");
const DEFAULT_CHART_INDEX = path.join(GENERATED, "chart-index.json");
const DEFAULT_MANIFEST = path.join(GENERATED, "manifest.json");
const DEFAULT_OUTPUT_DIR = path.join(GENERATED, "charts");
const DEFAULT_SUMMARY = path.join(GENERATED, "exact-chart-corpus.json");

export const SOURCE_TYPE = "yagoo-dori-exact-corpus";
export const DEFAULT_SOURCE_REPOSITORY = "asciisyaez/yagoo-dori";
export const DEFAULT_SOURCE_COMMIT = "6c2c95d52c268862d34fb523d965f09a3108bbbd";
export const DEFAULT_SOURCE_PATH = "data/generated/holodori-chart-timelines.json";

const NOTE_TYPES = Object.freeze([
  "tap",
  "flick",
  "long_start",
  "long_end",
  "long_flick_end",
  "long_continuation",
  "long_relay",
  "damage",
]);

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function roundSeconds(microseconds) {
  return Math.round((Number(microseconds) / 1_000_000) * 1_000_000) / 1_000_000;
}

function chartKey(musicId, difficulty) {
  return `${String(musicId ?? "")}:${String(difficulty ?? "").toUpperCase()}`;
}

function scoreNormalizedNoteType(value) {
  return String(value ?? "").replace(/^critical_/, "").replace(/^normal$/, "tap");
}

function canonicalTimeline(metadata) {
  const notes = [...(metadata?.notes ?? [])]
    .map((note) => [scoreNormalizedNoteType(note?.[0]), Number(note?.[1])])
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
  const skills = [...(metadata?.skills ?? [])]
    .map((skill) => ({
      slot: Number(skill?.slot),
      time: Number(skill?.time),
      combo: Number(skill?.combo),
    }))
    .sort((left, right) => left.slot - right.slot);
  const fever = metadata?.fever
    ? { start: Number(metadata.fever.start), end: Number(metadata.fever.end) }
    : null;
  return JSON.stringify({ notes, skills, fever });
}

function requireArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function corpusNote(event, key) {
  if (!Array.isArray(event) || event.length < 3) throw new Error(`${key}: malformed timeline event`);
  const microseconds = Number(event[0]);
  const typeCode = Number(event[1]);
  const critical = Number(event[2]) === 1;
  if (!Number.isFinite(microseconds) || microseconds < 0) throw new Error(`${key}: invalid event time`);
  if (!Number.isInteger(typeCode) || typeCode < 0 || typeCode >= NOTE_TYPES.length) {
    throw new Error(`${key}: invalid note type code ${event[1]}`);
  }
  const base = NOTE_TYPES[typeCode];
  if (base === "damage") throw new Error(`${key}: damage-note timelines are not supported by the score engine`);
  return [critical ? `critical_${base}` : base, roundSeconds(microseconds)];
}

function corpusFever(markers) {
  if (!markers || typeof markers !== "object") return null;
  const start = Number(markers.feverStart);
  const end = Number(markers.feverEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start: roundSeconds(start), end: roundSeconds(end) };
}

export function convertCorpusChart(sourceChart, localChart, provenance) {
  const difficulty = String(sourceChart?.difficulty ?? "").toUpperCase();
  const key = chartKey(sourceChart?.songId, difficulty);
  const events = requireArray(sourceChart?.events, `${key}: events missing`);
  const markers = requireArray(sourceChart?.specialMarkerMicroseconds, `${key}: SP markers missing`);
  const combos = requireArray(sourceChart?.specialStartsAtCombo, `${key}: SP combo starts missing`);
  if (markers.length !== 5 || combos.length !== 5) throw new Error(`${key}: expected five SP markers`);
  if (events.length !== Number(localChart.fullComboNoteCount)) {
    throw new Error(`${key}: event count ${events.length} != Master ${localChart.fullComboNoteCount}`);
  }

  const notes = events.map((event) => corpusNote(event, key));
  for (let index = 1; index < notes.length; index += 1) {
    if (notes[index][1] + 1e-9 < notes[index - 1][1]) throw new Error(`${key}: notes are not chronological`);
  }

  const skills = markers.map((microseconds, index) => {
    const time = roundSeconds(microseconds);
    const combo = Number(combos[index]);
    if (!Number.isFinite(time) || time < 0 || !Number.isInteger(combo) || combo < 0) {
      throw new Error(`${key}: invalid SP marker ${index + 1}`);
    }
    return { slot: index + 1, time, combo };
  });
  for (let index = 1; index < skills.length; index += 1) {
    if (skills[index].time <= skills[index - 1].time) throw new Error(`${key}: SP markers are not strictly chronological`);
  }

  const source = sourceChart?.source ?? {};
  return {
    version: 1,
    musicId: localChart.musicId,
    difficulty: localChart.difficulty,
    chartHash: localChart.chartHash ?? null,
    chartAssetId: localChart.chartAssetId ?? null,
    fullComboNoteCount: Number(localChart.fullComboNoteCount) || notes.length,
    notes,
    skills,
    fever: corpusFever(sourceChart.feverMarkerMicroseconds),
    sourceType: SOURCE_TYPE,
    sourceRepository: provenance.repository,
    sourceCommit: provenance.commit,
    sourcePath: provenance.path,
    sourceChartKey: sourceChart.key ?? `${sourceChart.songId}:${String(sourceChart.difficulty ?? "").toLowerCase()}`,
    sourceSchemaVersion: provenance.schemaVersion,
    sourceTransformVersion: provenance.transformVersion,
    sourceApiRevision: provenance.apiRevision,
    sourceRetrievedAt: provenance.retrievedAt,
    sourceSusUrl: source?.sus?.url ?? null,
    sourceSusSha256: source?.sus?.sha256 ?? null,
    sourceMetadataUrl: source?.metadata?.url ?? null,
    sourceMetadataSha256: source?.metadata?.sha256 ?? null,
  };
}

export function compareCorpusChart(sourceChart, localChart) {
  const reasons = [];
  const sourceHash = String(sourceChart?.upstreamChartHash ?? "");
  const localHash = String(localChart?.chartHash ?? "");
  if (sourceHash && localHash && sourceHash !== localHash) reasons.push("chartHash");
  if (Number(sourceChart?.fullComboNoteCount) !== Number(localChart?.fullComboNoteCount)) reasons.push("fullComboNoteCount");
  if (sourceChart?.chartAssetId && localChart?.chartAssetId && sourceChart.chartAssetId !== localChart.chartAssetId) reasons.push("chartAssetId");
  if (Number(sourceChart?.normalNoteCount) !== Number(localChart?.normalNoteCount)) reasons.push("normalNoteCount");
  return reasons;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, payload, compact = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(payload, null, compact ? 0 : 2)}\n`, "utf8");
}

async function existingMetadata(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function importCorpus({
  sourceFile,
  chartIndexFile = DEFAULT_CHART_INDEX,
  manifestFile = DEFAULT_MANIFEST,
  outputDir = DEFAULT_OUTPUT_DIR,
  summaryFile = DEFAULT_SUMMARY,
  write = false,
  sourceRepository = DEFAULT_SOURCE_REPOSITORY,
  sourceCommit = DEFAULT_SOURCE_COMMIT,
  sourcePath = DEFAULT_SOURCE_PATH,
} = {}) {
  if (!sourceFile) throw new Error("--source=<path> is required");
  const [corpus, chartIndex, manifest] = await Promise.all([
    readJson(sourceFile),
    readJson(chartIndexFile),
    readJson(manifestFile),
  ]);
  if (Number(corpus.schemaVersion) !== 1) throw new Error(`Unsupported corpus schema ${corpus.schemaVersion}`);
  if (!Array.isArray(corpus.charts)) throw new Error("Corpus charts array is missing");
  const localCharts = chartIndex?.charts ?? {};
  const provenance = {
    repository: sourceRepository,
    commit: sourceCommit,
    path: sourcePath,
    schemaVersion: Number(corpus.schemaVersion),
    transformVersion: corpus.transformVersion ?? null,
    apiRevision: corpus.sourceSnapshot?.apiRevision ?? null,
    retrievedAt: corpus.retrievedAt ?? null,
    sourceLicense: corpus.sourceSnapshot?.sourceLicense ?? null,
  };

  const matched = [];
  const mismatches = [];
  const sourceOnly = [];
  const preservedExisting = [];
  const independentConflicts = [];
  const desiredCorpusFiles = new Set();
  let parityFixtureMatched = false;

  for (const sourceChart of corpus.charts) {
    const key = chartKey(sourceChart.songId, sourceChart.difficulty);
    const localChart = localCharts[key];
    if (!localChart) {
      sourceOnly.push(key);
      continue;
    }
    const reasons = compareCorpusChart(sourceChart, localChart);
    if (reasons.length) {
      mismatches.push({ key, reasons });
      continue;
    }

    let converted;
    try {
      converted = convertCorpusChart(sourceChart, localChart, provenance);
    } catch (error) {
      mismatches.push({ key, reasons: [String(error?.message ?? error)] });
      continue;
    }

    const fileName = `${localChart.musicId}-${localChart.difficulty}.json`;
    const file = path.join(outputDir, fileName);
    const existing = await existingMetadata(file);
    if (existing && existing.sourceType !== SOURCE_TYPE) {
      const timelineMatched = canonicalTimeline(existing) === canonicalTimeline(converted);
      if (timelineMatched) {
        preservedExisting.push(key);
        if (key === "m0049:EXPERT") parityFixtureMatched = true;
      } else {
        independentConflicts.push({
          key,
          existingNoteCount: Array.isArray(existing.notes) ? existing.notes.length : null,
          corpusNoteCount: converted.notes.length,
          existingSkills: existing.skills ?? [],
          corpusSkills: converted.skills,
          existingFever: existing.fever ?? null,
          corpusFever: converted.fever,
        });
      }
    } else if (write) {
      await writeJson(file, converted, true);
    }
    if (!existing || existing.sourceType === SOURCE_TYPE) desiredCorpusFiles.add(fileName);
    matched.push(key);
  }

  let removedCorpusFiles = 0;
  if (write) {
    await fs.mkdir(outputDir, { recursive: true });
    for (const entry of await fs.readdir(outputDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json") || desiredCorpusFiles.has(entry.name)) continue;
      const file = path.join(outputDir, entry.name);
      const metadata = await existingMetadata(file);
      if (metadata?.sourceType === SOURCE_TYPE) {
        await fs.unlink(file);
        removedCorpusFiles += 1;
      }
    }
  }

  const unavailable = Array.isArray(corpus.unavailableCharts)
    ? corpus.unavailableCharts.map((chart) => ({
      key: chartKey(chart.songId, chart.difficulty),
      reason: chart.reason ?? "unavailable",
      upstreamChartHash: chart.upstreamChartHash ?? null,
    }))
    : [];

  const summary = {
    version: 1,
    sourceType: SOURCE_TYPE,
    sourceRepository,
    sourceCommit,
    sourcePath,
    sourceSchemaVersion: provenance.schemaVersion,
    sourceTransformVersion: provenance.transformVersion,
    sourceApiRevision: provenance.apiRevision,
    sourceRetrievedAt: provenance.retrievedAt,
    sourceLicense: provenance.sourceLicense,
    localMasterVersion: manifest.master_version ?? null,
    localChartSourceCommit: chartIndex.source_commit ?? null,
    localChartCount: Object.keys(localCharts).length,
    corpusAvailableCount: corpus.charts.length,
    corpusUnavailableCount: unavailable.length,
    matchingCount: matched.length,
    preservedIndependentExactCount: preservedExisting.length,
    independentConflictCount: independentConflicts.length,
    mismatchCount: mismatches.length,
    sourceOnlyCount: sourceOnly.length,
    removedCorpusFiles,
    parityFixture: {
      key: "m0049:EXPERT",
      comparison: "score-engine-normalized-note-types + SP markers + Fever",
      matchedExistingTimeline: parityFixtureMatched,
    },
    independentConflicts,
    mismatches,
    sourceOnly,
    unavailable,
  };

  if (write) await writeJson(summaryFile, summary, false);
  return summary;
}

async function main() {
  const sourceFile = argValue("--source");
  const summary = await importCorpus({
    sourceFile,
    chartIndexFile: argValue("--chart-index", DEFAULT_CHART_INDEX),
    manifestFile: argValue("--manifest", DEFAULT_MANIFEST),
    outputDir: argValue("--output-dir", DEFAULT_OUTPUT_DIR),
    summaryFile: argValue("--summary", DEFAULT_SUMMARY),
    write: hasArg("--write"),
    sourceRepository: argValue("--source-repository", DEFAULT_SOURCE_REPOSITORY),
    sourceCommit: argValue("--source-commit", DEFAULT_SOURCE_COMMIT),
    sourcePath: argValue("--source-path", DEFAULT_SOURCE_PATH),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.parityFixture.matchedExistingTimeline) {
    throw new Error("m0049:EXPERT score-equivalent parity fixture did not match the existing independently sourced timeline");
  }
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
