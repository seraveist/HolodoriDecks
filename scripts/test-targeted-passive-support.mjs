import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

function member(id, activeScore, boosted = false, passive = null) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(boosted ? ["grp-boosted"] : []),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 1000, t: 1000, s: 1000 },
    enhancementPermyriad: 0,
    passive,
    active: { level: 1, interval: 10, probability: activeScore ? 1 : 0, duration: 20, baseScoreUp: activeScore, conditionalScoreUp: activeScore, condition: null, description: id },
    special: { level: 1, duration: 0, support: 0, activationRateUp: 0, condition: null, description: id },
  };
}
const leader = {
  id: "L", characterId: "char-L", characterName: "L",
  leader: { primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 }, additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "" },
};
const passive = { level: 1, condition: null, description: "target support", effect: { kind: "support", value: 100, target: { kind: "group", value: "grp-boosted", count: 1 } } };
const notes = Array.from({ length: 30 }, (_, index) => ["tap", 10.5 + index * 0.5]);
const chart = { fullComboNoteCount: notes.length, chartHash: "support-test", metadata: { notes, skills: [], fever: null } };
const music = { id: "support-test", title: "support", playing_seconds: 30, live_score_coefficient_permil: 5, _chart: chart, _scoreRules: rules };

function score(boostStrong) {
  const members = [
    member("P", 0, false, passive),
    member("STRONG", 100, boostStrong),
    member("WEAK", 20, !boostStrong),
    member("D", 0),
    member("E", 0),
  ];
  return evaluateDeck({ leader, members, music, difficulty: "EXPERT", playMode: "manual", separateRole: true });
}
const strong = score(true);
const weak = score(false);
assert.ok(strong?.rankingScore > weak?.rankingScore, `${strong?.rankingScore} should exceed ${weak?.rankingScore}`);
assert.equal(strong.songProjection.context.chartAccuracy, "exact");
console.log(`targeted passive support test: ${strong.rankingScore} > ${weak.rankingScore}`);
