import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { chartMetadataMatchesEntry, convertRuntimeChartObject } from "../js/chart-data.js";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), "utf8"));
const charts = read("chart-index").charts;
const runtime = read("exact-runtime-index");
const songs = read("music");
const rules = read("live-score-rules");
const cards = read("cards").filter(c => Number(c.rarity) === 5);
const prepared = [...prepareScoreCards(cards, new Map(read("characters").map(c => [c.id, c])), {}, { masterRefs: read("master_refs") }).values()];
const failures = [];
const counts = { songs: songs.length, master: 0, estimated: 0, localExact: 0, runtimeExact: 0 };
let runtimeBytes = null;
const runtimePath = process.argv.indexOf("--runtime");
if (runtimePath >= 0) {
  runtimeBytes = fs.readFileSync(process.argv[runtimePath + 1]);
  assert.equal(createHash("sha256").update(runtimeBytes).digest("hex"), runtime.source.sha256, "pinned runtime file hash");
}
let index = 0;
for (const song of songs) {
  for (const difficulty of ["EASY", "NORMAL", "HARD", "EXPERT"]) {
    const key = `${song.id}:${difficulty}`;
    const entry = charts[key];
    if (entry) {
      assert.equal(entry.musicId, song.id, `${key}: Master song association`);
      assert.equal(entry.difficulty, difficulty, `${key}: Master difficulty association`);
    }
    const leader = prepared[index % prepared.length];
    const members = [];
    const characters = new Set([leader.characterId]);
    for (let offset = 1; members.length < 5 && offset < prepared.length; offset++) {
      const candidate = prepared[(index + offset) % prepared.length];
      if (characters.has(candidate.characterId)) continue;
      members.push(candidate);
      characters.add(candidate.characterId);
    }
    assert.equal(members.length, 5);
    index++;
    const variants = { ...(entry ? { master: { ...entry, metadata: null } } : {}), estimated: null };
    if (entry?.metadataPath) {
      const metadata = JSON.parse(fs.readFileSync(new URL(`../data/generated/${entry.metadataPath}`, import.meta.url), "utf8"));
      assert.equal(chartMetadataMatchesEntry(metadata, entry), true, `${key}: local metadata coherence`);
      variants.localExact = { ...entry, metadata };
    }
    if (runtimeBytes && runtime.charts[key]) {
      const range = runtime.charts[key];
      const bytes = runtimeBytes.subarray(range.start, range.end + 1);
      assert.equal(bytes.length, range.length, `${key}: byte length`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), range.objectSha256, `${key}: object hash`);
      const source = JSON.parse(bytes.toString("utf8"));
      variants.runtimeExact = { ...entry, metadata: convertRuntimeChartObject(source, entry) };
    }
    for (const [accuracy, chart] of Object.entries(variants)) {
      counts[accuracy]++;
      const music = { ...song, _chart: chart, _scoreRules: rules };
      const evaluate = (playMode, evaluationTarget = "both", selectedMembers = members) => evaluateDeck({ leader, members: selectedMembers, music, difficulty, playMode, evaluationTarget });
      try {
        const auto = evaluate("auto");
        for (const playMode of ["auto", "manual"]) {
          const both = playMode === "auto" ? auto : evaluate(playMode);
          assert.ok(Number.isFinite(both.rankingScore) && both.rankingScore > 0, "finite positive expected score");
          assert.ok(Number.isFinite(both.potentialRankingScore) && both.potentialRankingScore >= both.rankingScore, "maximum ≥ expected");
          assert.equal(evaluate(playMode, "score").rankingScore, both.rankingScore, "expected-only search agrees with final result");
          assert.equal(evaluate(playMode, "potential").potentialRankingScore, both.potentialRankingScore, "maximum-only search agrees with final result");
          assert.ok(both.rankingScore >= auto.rankingScore && both.potentialRankingScore >= auto.potentialRankingScore, "manual ≥ AUTO");
          assert.equal(both.unitScore, auto.unitScore, "play mode does not change Unit score");
          if (chart?.metadata) assert.equal(both.songProjection.specialWindows.length, 5, "all five SP skills included");
        }
        const lower = members.map(m => ({ ...m, active: { ...m.active, probability: m.active.probability / 2 } }));
        assert.equal(evaluate("auto", "potential", lower).potentialRankingScore, auto.potentialRankingScore, "positive activation probability cannot change all-success maximum");
      } catch (error) {
        failures.push(`${key}/${accuracy}: ${error.message}`);
      }
    }
  }
}
if (runtimeBytes) assert.equal(counts.runtimeExact, runtime.runtimeExactCount);
assert.equal(failures.length, 0, failures.slice(0, 20).join("\n"));
console.log(`song corpus: ${JSON.stringify(counts)}; all score/maximum, play-mode and SP checks passed`);
