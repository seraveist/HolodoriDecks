const GENERATED_BASE = new URL("../data/generated/", import.meta.url);
const CHART_INDEX_URL = new URL("chart-index.json", GENERATED_BASE);
const SCORE_RULES_URL = new URL("live-score-rules.json", GENERATED_BASE);

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

export async function loadChartResources(manifest = {}) {
  const version = manifest.source_commit || manifest.master_version || Date.now();
  const [index, scoreRules] = await Promise.all([
    fetchOptionalJson(versionedUrl(CHART_INDEX_URL, version)),
    fetchOptionalJson(versionedUrl(SCORE_RULES_URL, version)),
  ]);
  const charts = index?.charts && typeof index.charts === "object" ? index.charts : {};
  return {
    version,
    index: index ?? { version: 1, charts: {}, chart_count: 0, exact_metadata_count: 0 },
    scoreRules: scoreRules ?? null,
    chartsByKey: new Map(Object.entries(charts)),
  };
}

export async function loadSelectedChart(resources, musicId, difficulty) {
  if (!resources || !musicId) return null;
  const entry = resources.chartsByKey.get(chartKey(musicId, difficulty));
  if (!entry) return null;
  if (!entry.metadataPath) return { ...entry, metadata: null };

  const metadataUrl = versionedUrl(new URL(entry.metadataPath, CHART_INDEX_URL), resources.version);
  const metadata = await fetchOptionalJson(metadataUrl);
  return { ...entry, metadata: metadata ?? null };
}
