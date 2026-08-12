import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const GENERATED = path.join(ROOT, "data", "generated");
const MANIFEST_PATH = path.join(GENERATED, "manifest.json");
const DIFFICULTIES = Object.freeze({ 1: "EASY", 2: "NORMAL", 3: "HARD", 4: "EXPERT" });
const NOTE_TYPE = Object.freeze({
  LIVE_NOTE_TYPE_NORMAL: "tap",
  LIVE_NOTE_TYPE_FLICK: "flick",
  LIVE_NOTE_TYPE_LONG_START: "long_start",
  LIVE_NOTE_TYPE_LONG_RELAY: "long_relay",
  LIVE_NOTE_TYPE_LONG_CONTINUATION: "long_continuation",
  LIVE_NOTE_TYPE_LONG_END: "long_end",
  LIVE_NOTE_TYPE_LONG_FLICK_END: "long_flick_end",
});

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function fetchJson(repository, commit, filename) {
  const url = `https://raw.githubusercontent.com/${repository}/${commit}/${filename}`;
  const response = await fetch(url, { headers: { "user-agent": "HolodoriDecks-chart-index" } });
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  return response.json();
}

function difficultyFromRow(row) {
  return DIFFICULTIES[Number(row.difficulty_type)] ?? null;
}

function chartKey(musicId, difficulty) {
  return `${musicId}:${difficulty}`;
}

async function exactMetadataStatus(musicId, difficulty, chartHash, fullComboNoteCount) {
  const fileName = `${musicId}-${difficulty}.json`;
  const absolute = path.join(GENERATED, "charts", fileName);
  try {
    const metadata = await readJson(absolute);
    if (String(metadata.musicId ?? "") !== musicId) {
      return { metadataPath: null, stale: `${fileName}: musicId mismatch` };
    }
    if (String(metadata.difficulty ?? "").toUpperCase() !== difficulty) {
      return { metadataPath: null, stale: `${fileName}: difficulty mismatch` };
    }
    if (chartHash && metadata.chartHash && String(metadata.chartHash) !== String(chartHash)) {
      return { metadataPath: null, stale: `${fileName}: chartHash changed` };
    }
    const metadataFullCombo = Number(metadata.fullComboNoteCount) || 0;
    if (fullComboNoteCount && metadataFullCombo && metadataFullCombo !== fullComboNoteCount) {
      return { metadataPath: null, stale: `${fileName}: fullComboNoteCount changed` };
    }
    if (fullComboNoteCount && Array.isArray(metadata.notes) && metadata.notes.length !== fullComboNoteCount) {
      return { metadataPath: null, stale: `${fileName}: note count changed` };
    }
    return { metadataPath: `./charts/${fileName}`, stale: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { metadataPath: null, stale: null };
    throw error;
  }
}

function noteTypeName(value) {
  const raw = String(value ?? "");
  const marker = "LIVE_NOTE_TYPE_";
  const index = raw.lastIndexOf(marker);
  return index >= 0 ? raw.slice(index) : raw;
}

function judgementName(value) {
  const raw = String(value ?? "");
  const marker = "LIVE_NOTE_JUDGEMENT_TYPE_";
  const index = raw.lastIndexOf(marker);
  return index >= 0 ? raw.slice(index + marker.length) : raw;
}

function buildNoteWeights(liveNote) {
  const manual = {};
  const auto = {};
  for (const row of liveNote) {
    const data = row.data ?? {};
    const type = NOTE_TYPE[noteTypeName(data.noteType)];
    if (!type) continue;
    const judgement = judgementName(data.judgementType);
    const weight = Number(data.scoreCoefficientPermilMultiply) / 1000;
    if (!Number.isFinite(weight)) continue;
    if (judgement === "PERFECT") manual[type] = weight;
    if (judgement === "AUTO") auto[type] = weight;
  }
  return { manual, auto };
}

function buildCombo(liveCombo) {
  return liveCombo
    .map((row) => ({
      from: Number(row.data?.comboCountFrom ?? row.combo_count_from ?? 0) || 0,
      scoreUpPct: (Number(row.data?.scoreUpPermil ?? 0) || 0) / 10,
    }))
    .sort((left, right) => left.from - right.from);
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const repository = manifest.source_repository;
  const commit = manifest.source_commit;
  if (!repository || !commit) throw new Error("manifest source_repository/source_commit is required");

  const [difficultyChart, difficultyRows, liveNote, liveCombo] = await Promise.all([
    fetchJson(repository, commit, "MusicDifficultyChart.json"),
    fetchJson(repository, commit, "MusicDifficulty.json"),
    fetchJson(repository, commit, "LiveNote.json"),
    fetchJson(repository, commit, "LiveCombo.json"),
  ]);

  const difficultyByKey = new Map(difficultyRows.map((row) => [
    chartKey(row.music_id, difficultyFromRow(row)),
    row,
  ]));
  const charts = {};
  let exactCount = 0;
  const staleMetadata = [];
  for (const row of difficultyChart) {
    const difficulty = difficultyFromRow(row);
    if (!difficulty || !row.music_id) continue;
    const data = row.data ?? {};
    const detail = difficultyByKey.get(chartKey(row.music_id, difficulty))?.data ?? {};
    const fullComboNoteCount = Number(data.fullComboNoteCount) || 0;
    const chartHash = data.chartHash ?? null;
    const metadata = await exactMetadataStatus(
      row.music_id,
      difficulty,
      chartHash,
      fullComboNoteCount,
    );
    if (metadata.metadataPath) exactCount += 1;
    if (metadata.stale) staleMetadata.push(metadata.stale);
    charts[chartKey(row.music_id, difficulty)] = {
      musicId: row.music_id,
      difficulty,
      difficultyType: Number(row.difficulty_type),
      difficultyLevel: Number(detail.difficultyLevel) || null,
      chartAssetId: detail.chartAssetId ?? null,
      fullComboNoteCount,
      normalNoteCount: Number(data.normalNoteCount) || 0,
      maxComboCountRewardThreshold: Number(data.maxComboCountRewardThreshold) || 0,
      chartHash,
      metadataPath: metadata.metadataPath,
    };
  }

  const index = {
    version: 1,
    source_repository: repository,
    source_commit: commit,
    chart_count: Object.keys(charts).length,
    exact_metadata_count: exactCount,
    stale_metadata_count: staleMetadata.length,
    stale_metadata: staleMetadata,
    charts,
  };
  const scoreRules = {
    version: 1,
    source_repository: repository,
    source_commit: commit,
    noteWeights: buildNoteWeights(liveNote),
    combo: buildCombo(liveCombo),
    notes: "Manual uses PERFECT score coefficients; AUTO uses AUTO score coefficients. Critical variants reuse the base note type coefficient.",
  };

  await fs.mkdir(GENERATED, { recursive: true });
  await fs.writeFile(path.join(GENERATED, "chart-index.json"), `${JSON.stringify(index, null, 2)}\n`);
  await fs.writeFile(path.join(GENERATED, "live-score-rules.json"), `${JSON.stringify(scoreRules, null, 2)}\n`);
  console.log(`chart-index: ${index.chart_count} charts, ${exactCount} exact metadata files, ${staleMetadata.length} stale metadata files`);
  if (staleMetadata.length) {
    for (const item of staleMetadata) console.warn(`[chart-index] stale exact metadata disabled: ${item}`);
  }
  console.log(`score-rules: ${Object.keys(scoreRules.noteWeights.manual).length} manual note types, ${scoreRules.combo.length} combo thresholds`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
