const GENERATED_BASE = new URL("../data/generated/", import.meta.url);
const CHART_INDEX_URL = new URL("chart-index.json", GENERATED_BASE);
const SCORE_RULES_URL = new URL("live-score-rules.json", GENERATED_BASE);
const EXACT_RUNTIME_INDEX_URL = new URL("exact-runtime-index.json", GENERATED_BASE);

const RUNTIME_NOTE_TYPES = Object.freeze([
  "tap",
  "flick",
  "long_start",
  "long_end",
  "long_flick_end",
  "long_continuation",
  "long_relay",
  "damage",
]);

async function fetchOptionalJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function versionedUrl(url, version) {
  const result = new URL(url);
  result.searchParams.set("v", String(version));
  return result;
}

export function chartKey(musicId, difficulty) {
  return `${String(musicId ?? "")}:${String(difficulty ?? "EXPERT").toUpperCase()}`;
}

function seconds(microseconds) {
  return Math.round(Number(microseconds)) / 1_000_000;
}

function runtimeNoteName(event) {
  const code = Number(event?.[1]);
  const critical = Number(event?.[2]) === 1;
  const base = RUNTIME_NOTE_TYPES[code];
  if (!base || base === "damage") throw new Error(`unsupported runtime note type: ${event?.[1]}`);
  return critical ? `critical_${base}` : base;
}

export function runtimeEntryMatchesChart(runtimeEntry, chartEntry) {
  if (!runtimeEntry || !chartEntry) return false;
  return String(runtimeEntry.musicId ?? "") === String(chartEntry.musicId ?? "")
    && String(runtimeEntry.difficulty ?? "").toUpperCase() === String(chartEntry.difficulty ?? "").toUpperCase()
    && String(runtimeEntry.chartHash ?? "") === String(chartEntry.chartHash ?? "")
    && Number(runtimeEntry.fullComboNoteCount) === Number(chartEntry.fullComboNoteCount)
    && Number(runtimeEntry.normalNoteCount) === Number(chartEntry.normalNoteCount)
    && (!runtimeEntry.chartAssetId || !chartEntry.chartAssetId
      || String(runtimeEntry.chartAssetId) === String(chartEntry.chartAssetId));
}

export function convertRuntimeChartObject(sourceChart, chartEntry) {
  const key = chartKey(chartEntry?.musicId, chartEntry?.difficulty);
  if (String(sourceChart?.songId ?? "") !== String(chartEntry?.musicId ?? "")) {
    throw new Error(`${key}: runtime music id mismatch`);
  }
  if (String(sourceChart?.difficulty ?? "").toUpperCase() !== String(chartEntry?.difficulty ?? "").toUpperCase()) {
    throw new Error(`${key}: runtime difficulty mismatch`);
  }
  if (String(sourceChart?.upstreamChartHash ?? "") !== String(chartEntry?.chartHash ?? "")) {
    throw new Error(`${key}: runtime chart hash mismatch`);
  }
  if (Number(sourceChart?.fullComboNoteCount) !== Number(chartEntry?.fullComboNoteCount)) {
    throw new Error(`${key}: runtime full-combo mismatch`);
  }
  if (Number(sourceChart?.normalNoteCount) !== Number(chartEntry?.normalNoteCount)) {
    throw new Error(`${key}: runtime normal-note mismatch`);
  }
  if (sourceChart?.chartAssetId && chartEntry?.chartAssetId
    && String(sourceChart.chartAssetId) !== String(chartEntry.chartAssetId)) {
    throw new Error(`${key}: runtime chart asset mismatch`);
  }

  const events = sourceChart?.events;
  const specialMarkers = sourceChart?.specialMarkerMicroseconds;
  const specialCombos = sourceChart?.specialStartsAtCombo;
  if (!Array.isArray(events) || events.length !== Number(chartEntry.fullComboNoteCount)) {
    throw new Error(`${key}: runtime event count mismatch`);
  }
  if (!Array.isArray(specialMarkers) || specialMarkers.length !== 5
    || !Array.isArray(specialCombos) || specialCombos.length !== 5) {
    throw new Error(`${key}: runtime SP markers are incomplete`);
  }

  const notes = events.map((event, index) => {
    const time = seconds(event?.[0]);
    if (!Number.isFinite(time) || time < 0) throw new Error(`${key}: invalid runtime note time`);
    if (index > 0 && time < seconds(events[index - 1]?.[0])) throw new Error(`${key}: runtime notes are not chronological`);
    return [runtimeNoteName(event), time];
  });
  const skills = specialMarkers.map((marker, index) => {
    const time = seconds(marker);
    const combo = Number(specialCombos[index]);
    if (!Number.isFinite(time) || time < 0 || !Number.isInteger(combo) || combo < 0) {
      throw new Error(`${key}: invalid runtime SP marker`);
    }
    if (index > 0 && time <= seconds(specialMarkers[index - 1])) {
      throw new Error(`${key}: runtime SP markers are not chronological`);
    }
    return { slot: index + 1, time, combo };
  });
  const marker = sourceChart?.feverMarkerMicroseconds;
  const fever = marker && Number.isFinite(Number(marker.feverStart)) && Number.isFinite(Number(marker.feverEnd))
    ? { start: seconds(marker.feverStart), end: seconds(marker.feverEnd) }
    : null;
  if (fever && fever.end <= fever.start) throw new Error(`${key}: invalid runtime Fever window`);

  return {
    version: 1,
    musicId: chartEntry.musicId,
    difficulty: chartEntry.difficulty,
    chartHash: chartEntry.chartHash ?? null,
    chartAssetId: chartEntry.chartAssetId ?? null,
    fullComboNoteCount: Number(chartEntry.fullComboNoteCount) || notes.length,
    notes,
    skills,
    fever,
    feverCharge: marker && Number.isFinite(Number(marker.chargeStart)) && Number.isFinite(Number(marker.chargeEnd))
      ? { start: seconds(marker.chargeStart), end: seconds(marker.chargeEnd) }
      : null,
    waveOffsetMicroseconds: Number(sourceChart?.waveOffsetMicroseconds) || 0,
    sourceRuntime: true,
    sourceChartKey: `${sourceChart.songId}:${String(sourceChart.difficulty).toLowerCase()}`,
    sourceSusSha256: sourceChart?.source?.sus?.sha256 ?? null,
    sourceMetadataSha256: sourceChart?.source?.metadata?.sha256 ?? null,
  };
}

async function sha256Hex(text) {
  try {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") return null;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function loadRuntimeMetadata(resources, chartEntry, runtimeEntry) {
  const sourceUrl = resources?.runtimeIndex?.source?.url;
  if (!sourceUrl || !runtimeEntryMatchesChart(runtimeEntry, chartEntry)) return null;
  const start = Number(runtimeEntry.start);
  const end = Number(runtimeEntry.end);
  const length = Number(runtimeEntry.length);
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(length)
    || start < 0 || end < start || length !== end - start + 1) return null;

  let response;
  try {
    response = await fetch(sourceUrl, {
      headers: { Range: `bytes=${start}-${end}` },
      cache: "force-cache",
      mode: "cors",
    });
  } catch {
    return null;
  }
  if (response.status !== 206) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return null;
  }
  const contentRange = String(response.headers?.get?.("content-range") ?? "").toLowerCase();
  if (!contentRange.startsWith(`bytes ${start}-${end}/`)) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return null;
  }

  try {
    const text = await response.text();
    if (typeof TextEncoder !== "undefined" && new TextEncoder().encode(text).byteLength !== length) return null;
    const expectedSha = String(runtimeEntry.objectSha256 ?? "");
    if (expectedSha) {
      const actualSha = await sha256Hex(text);
      if (!actualSha || actualSha !== expectedSha) return null;
    }
    const sourceChart = JSON.parse(text);
    return convertRuntimeChartObject(sourceChart, chartEntry);
  } catch {
    return null;
  }
}

export async function loadChartResources(manifest = {}) {
  const version = manifest.source_commit || manifest.master_version || Date.now();
  const [index, scoreRules, runtimeIndex] = await Promise.all([
    fetchOptionalJson(versionedUrl(CHART_INDEX_URL, version)),
    fetchOptionalJson(versionedUrl(SCORE_RULES_URL, version)),
    fetchOptionalJson(versionedUrl(EXACT_RUNTIME_INDEX_URL, version)),
  ]);
  const charts = index?.charts && typeof index.charts === "object" ? index.charts : {};
  const runtimeCharts = runtimeIndex?.charts && typeof runtimeIndex.charts === "object" ? runtimeIndex.charts : {};
  return {
    version,
    index: index ?? { version: 1, charts: {}, chart_count: 0, exact_metadata_count: 0 },
    scoreRules: scoreRules ?? null,
    chartsByKey: new Map(Object.entries(charts)),
    runtimeIndex: runtimeIndex ?? null,
    runtimeChartsByKey: new Map(Object.entries(runtimeCharts)),
  };
}

export async function loadSelectedChart(resources, musicId, difficulty) {
  if (!resources || !musicId) return null;
  const key = chartKey(musicId, difficulty);
  const entry = resources.chartsByKey.get(key);
  if (!entry) return null;

  if (entry.metadataPath) {
    const metadataUrl = versionedUrl(new URL(entry.metadataPath, CHART_INDEX_URL), resources.version);
    const metadata = await fetchOptionalJson(metadataUrl);
    if (metadata) return { ...entry, metadata };
  }

  const runtimeEntry = resources.runtimeChartsByKey?.get(key);
  const metadata = runtimeEntry ? await loadRuntimeMetadata(resources, entry, runtimeEntry) : null;
  return { ...entry, metadata: metadata ?? null };
}
