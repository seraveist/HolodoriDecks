import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_INDEX = path.join(ROOT, "data", "generated", "chart-index.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "generated", "charts");

const SOURCE = Object.freeze({
  repository: "asciisyaez/yagoo-dori",
  commit: "6c2c95d52c268862d34fb523d965f09a3108bbbd",
  path: "data/generated/holodori-chart-timelines.json",
  sourceId: "holodori-best-chart-corpus-r51",
  apiRevision: 51,
});

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

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    input: null,
    chartIndex: DEFAULT_INDEX,
    outputDir: DEFAULT_OUTPUT,
    report: null,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") options.input = argv[++index];
    else if (arg === "--chart-index") options.chartIndex = argv[++index];
    else if (arg === "--output-dir") options.outputDir = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--write") options.write = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:\n  node scripts/import-chart-timeline-corpus.mjs --input <corpus.json> [--report report.json] [--write]\n\nThe input must be the pinned ${SOURCE.repository}@${SOURCE.commit}/${SOURCE.path} snapshot.\nWithout --write this command performs a read-only compatibility audit.`);
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  if (!options.input) fail("--input <corpus.json> is required");
  return options;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function seconds(microseconds) {
  return Math.round(Number(microseconds)) / 1_000_000;
}

function sourceChartKey(chart) {
  return `${String(chart?.songId ?? "")}:${String(chart?.difficulty ?? "").toUpperCase()}`;
}

function sourceNoteName(event) {
  const code = Number(event?.[1]);
  const critical = Number(event?.[2]) === 1;
  const base = NOTE_TYPES[code];
  if (!base) fail(`Unknown timeline note type code: ${event?.[1]}`);
  if (base === "damage") return base;
  return critical ? `critical_${base}` : base;
}

function convertChart(chart, corpus) {
  const difficulty = String(chart.difficulty).toUpperCase();
  const notes = chart.events.map((event) => [sourceNoteName(event), seconds(event[0])]);
  const skills = chart.specialMarkerMicroseconds.map((time, index) => ({
    slot: index + 1,
    time: seconds(time),
    combo: Number(chart.specialStartsAtCombo[index]) || 0,
  }));
  const markers = chart.feverMarkerMicroseconds;
  const fever = markers ? {
    start: seconds(markers.feverStart),
    end: seconds(markers.feverEnd),
  } : null;
  const feverCharge = markers ? {
    start: seconds(markers.chargeStart),
    end: seconds(markers.chargeEnd),
  } : null;
  return {
    version: 1,
    musicId: chart.songId,
    difficulty,
    chartHash: chart.upstreamChartHash,
    chartAssetId: chart.chartAssetId,
    fullComboNoteCount: chart.fullComboNoteCount,
    notes,
    skills,
    fever,
    feverCharge,
    waveOffsetMicroseconds: chart.waveOffsetMicroseconds,
    sourceRepository: SOURCE.repository,
    sourceCommit: SOURCE.commit,
    sourcePath: SOURCE.path,
    sourceDataset: corpus?.sourceSnapshot?.id ?? SOURCE.sourceId,
    sourceApiRevision: corpus?.sourceSnapshot?.apiRevision ?? SOURCE.apiRevision,
    sourceRetrievedAt: chart?.source?.retrievedAt ?? corpus?.retrievedAt ?? null,
    sourceSusSha256: chart?.source?.sus?.sha256 ?? null,
    sourceMetadataSha256: chart?.source?.metadata?.sha256 ?? null,
  };
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parityPayload(metadata) {
  return {
    musicId: metadata?.musicId,
    difficulty: metadata?.difficulty,
    chartHash: metadata?.chartHash,
    fullComboNoteCount: metadata?.fullComboNoteCount,
    notes: metadata?.notes,
    skills: metadata?.skills,
    fever: metadata?.fever,
  };
}

function compareNotes(existingNotes = [], convertedNotes = []) {
  const length = Math.max(existingNotes.length, convertedNotes.length);
  let mismatchCount = 0;
  let typeMismatchCount = 0;
  let timeMismatchCount = 0;
  let maxAbsTimeDelta = 0;
  const samples = [];
  for (let index = 0; index < length; index += 1) {
    const existing = existingNotes[index] ?? null;
    const converted = convertedNotes[index] ?? null;
    const typeMismatch = String(existing?.[0] ?? "") !== String(converted?.[0] ?? "");
    const existingTime = Number(existing?.[1]);
    const convertedTime = Number(converted?.[1]);
    const delta = Number.isFinite(existingTime) && Number.isFinite(convertedTime)
      ? convertedTime - existingTime
      : null;
    const timeMismatch = delta == null || Math.abs(delta) > 1e-9;
    if (!typeMismatch && !timeMismatch) continue;
    mismatchCount += 1;
    if (typeMismatch) typeMismatchCount += 1;
    if (timeMismatch) timeMismatchCount += 1;
    if (delta != null) maxAbsTimeDelta = Math.max(maxAbsTimeDelta, Math.abs(delta));
    if (samples.length < 20) samples.push({ index, existing, converted, timeDelta: delta });
  }
  return {
    mismatchCount,
    typeMismatchCount,
    timeMismatchCount,
    maxAbsTimeDelta,
    samples,
  };
}

function validateAvailableChart(chart, masterChart) {
  const reasons = [];
  if (!masterChart) reasons.push("missing-current-master-chart");
  if (masterChart && String(chart.upstreamChartHash ?? "") !== String(masterChart.chartHash ?? "")) {
    reasons.push("chart-hash-mismatch");
  }
  if (masterChart && Number(chart.fullComboNoteCount) !== Number(masterChart.fullComboNoteCount)) {
    reasons.push("full-combo-mismatch");
  }
  if (masterChart && chart.chartAssetId && masterChart.chartAssetId
    && String(chart.chartAssetId) !== String(masterChart.chartAssetId)) {
    reasons.push("chart-asset-id-mismatch");
  }
  if (masterChart && Number(chart.normalNoteCount) !== Number(masterChart.normalNoteCount)) {
    reasons.push("normal-note-count-mismatch");
  }
  if (!Array.isArray(chart.events) || chart.events.length !== Number(chart.fullComboNoteCount)) {
    reasons.push("event-count-mismatch");
  }
  if (!Array.isArray(chart.specialMarkerMicroseconds) || chart.specialMarkerMicroseconds.length !== 5
    || !Array.isArray(chart.specialStartsAtCombo) || chart.specialStartsAtCombo.length !== 5) {
    reasons.push("invalid-special-markers");
  }
  if (Array.isArray(chart.specialMarkerMicroseconds)
    && chart.specialMarkerMicroseconds.some((time, index, rows) => index > 0 && Number(time) <= Number(rows[index - 1]))) {
    reasons.push("non-chronological-special-markers");
  }
  if (Array.isArray(chart.events)
    && chart.events.some((event, index, rows) => index > 0 && Number(event?.[0]) < Number(rows[index - 1]?.[0]))) {
    reasons.push("non-chronological-events");
  }
  if (Array.isArray(chart.events)
    && chart.events.some((event) => !Number.isInteger(Number(event?.[1])) || Number(event[1]) < 0 || Number(event[1]) >= NOTE_TYPES.length)) {
    reasons.push("unknown-note-type-code");
  }
  const damageEvents = Array.isArray(chart.events)
    ? chart.events.filter((event) => Number(event?.[1]) === 7).length
    : 0;
  if (damageEvents > 0) reasons.push("unsupported-damage-events");
  return { reasons, damageEvents };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [corpus, index] = await Promise.all([
    readJson(path.resolve(options.input)),
    readJson(path.resolve(options.chartIndex)),
  ]);

  if (Number(corpus?.schemaVersion) !== 1) fail(`Unexpected corpus schemaVersion: ${corpus?.schemaVersion}`);
  if (String(corpus?.sourceSnapshot?.id ?? "") !== SOURCE.sourceId) {
    fail(`Unexpected corpus source id: ${corpus?.sourceSnapshot?.id}`);
  }
  if (Number(corpus?.sourceSnapshot?.apiRevision) !== SOURCE.apiRevision) {
    fail(`Unexpected corpus API revision: ${corpus?.sourceSnapshot?.apiRevision}`);
  }
  const currentCharts = index?.charts ?? {};
  const available = Array.isArray(corpus?.charts) ? corpus.charts : [];
  const unavailable = Array.isArray(corpus?.unavailableCharts) ? corpus.unavailableCharts : [];
  const corpusKeys = new Set([...available, ...unavailable].map(sourceChartKey));

  const rejectionCounts = {};
  const rejections = [];
  const matches = [];
  const noteTypeCounts = Object.fromEntries(NOTE_TYPES.map((type) => [type, 0]));
  let criticalEvents = 0;
  let damageEvents = 0;
  for (const chart of available) {
    const key = sourceChartKey(chart);
    const masterChart = currentCharts[key];
    const validation = validateAvailableChart(chart, masterChart);
    damageEvents += validation.damageEvents;
    if (Array.isArray(chart.events)) {
      for (const event of chart.events) {
        const type = NOTE_TYPES[Number(event?.[1])];
        if (type) noteTypeCounts[type] += 1;
        if (Number(event?.[2]) === 1) criticalEvents += 1;
      }
    }
    if (validation.reasons.length) {
      for (const reason of validation.reasons) rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
      rejections.push({ key, reasons: validation.reasons });
      continue;
    }
    matches.push({ key, chart });
  }

  const unavailableReasons = {};
  for (const chart of unavailable) {
    const reason = String(chart?.reason ?? "unknown");
    unavailableReasons[reason] = (unavailableReasons[reason] ?? 0) + 1;
  }

  const missingFromCorpus = Object.keys(currentCharts).filter((key) => !corpusKeys.has(key));

  let m0049Parity = null;
  const fixture = matches.find((row) => row.key === "m0049:EXPERT");
  if (fixture) {
    const existingPath = path.join(ROOT, "data", "generated", "charts", "m0049-EXPERT.json");
    try {
      const existing = await readJson(existingPath);
      const converted = convertChart(fixture.chart, corpus);
      m0049Parity = {
        equal: deepEqual(parityPayload(existing), parityPayload(converted)),
        existingNotes: existing.notes?.length ?? 0,
        convertedNotes: converted.notes?.length ?? 0,
        noteComparison: compareNotes(existing.notes, converted.notes),
        existingSkills: existing.skills ?? [],
        convertedSkills: converted.skills ?? [],
        existingFever: existing.fever ?? null,
        convertedFever: converted.fever ?? null,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      m0049Parity = { equal: null, reason: "existing-fixture-missing" };
    }
  }

  if (options.write) {
    await fs.mkdir(path.resolve(options.outputDir), { recursive: true });
    for (const { chart } of matches) {
      const metadata = convertChart(chart, corpus);
      const file = path.join(path.resolve(options.outputDir), `${metadata.musicId}-${metadata.difficulty}.json`);
      await fs.writeFile(file, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    }
  }

  const report = {
    source: SOURCE,
    corpus: {
      retrievedAt: corpus.retrievedAt ?? null,
      declaredCounts: corpus.counts ?? null,
      availableCharts: available.length,
      unavailableCharts: unavailable.length,
      totalCharts: available.length + unavailable.length,
    },
    currentMaster: {
      sourceCommit: index.source_commit ?? null,
      chartCount: Number(index.chart_count) || Object.keys(currentCharts).length,
      existingExactMetadataCount: Number(index.exact_metadata_count) || 0,
    },
    compatibility: {
      usableExactCharts: matches.length,
      rejectedAvailableCharts: rejections.length,
      missingFromCorpus: missingFromCorpus.length,
      rejectionCounts,
      unavailableReasons,
      damageEvents,
      criticalEvents,
      noteTypeCounts,
      m0049Parity,
    },
    rejectedCharts: rejections,
    missingChartKeys: missingFromCorpus,
    writeMode: options.write,
    writtenCharts: options.write ? matches.length : 0,
  };

  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.report) await fs.writeFile(path.resolve(options.report), text, "utf8");
  process.stdout.write(text);

  if (m0049Parity?.equal === false) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
