import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

function makeMember(id, activeScore, targeted = false, passive = null) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(targeted ? ["grp-target"] : []),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 1000, t: 1000, s: 1000 },
    enhancementPermyriad: 0,
    passive,
    active: { level: 1, interval: 10, probability: activeScore ? 1 : 0, duration: 20, baseScoreUp: activeScore, conditionalScoreUp: activeScore, condition: null, description: id },
    special: { level: 1, duration: 0, support: 0, activationRateUp: 0, condition: null, description: id },
  };
}

const leader = {
  id: "L",
  characterId: "char-L",
  characterName: "L",
  leader: { primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 }, additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "" },
};
const passive = { level: 1, condition: null, description: "target support", effect: { kind: "support", value: 10, target: { kind: "group", value: "grp-target", count: 1 } } };
const notes = Array.from({ length: 30 }, (_, index) => ["tap", 10.5 + index * 0.5]);
const chart = { fullComboNoteCount: notes.length, chartHash: "support-test", metadata: { notes, skills: [], fever: null } };
const music = { id: "support-test", title: "support", playing_seconds: 30, live_score_coefficient_permil: 5, _chart: chart, _scoreRules: rules };

function evaluate(targetFirst) {
  const members = [
    makeMember("P", 0, false, passive),
    makeMember("A", 100, targetFirst),
    makeMember("B", 20, !targetFirst),
    makeMember("D", 0),
    makeMember("E", 0),
  ];
  return evaluateDeck({ leader, members, music, difficulty: "EXPERT", playMode: "manual", separateRole: true });
}

const first = evaluate(true);
const second = evaluate(false);
assert.equal(first.songProjection.context.chartAccuracy, "exact");
assert.ok(first.songProjection.expected.skillMultiplier > second.songProjection.expected.skillMultiplier);
const firstDetails = new Map(first.songProjection.expected.details.map((row) => [row.cardId, row]));
const secondDetails = new Map(second.songProjection.expected.details.map((row) => [row.cardId, row]));
assert.equal(firstDetails.get("A").staticSupportPct, 10);
assert.equal(firstDetails.get("B").staticSupportPct, 0);
assert.equal(secondDetails.get("A").staticSupportPct, 0);
assert.equal(secondDetails.get("B").staticSupportPct, 10);
console.log("targeted passive support regression: OK");
