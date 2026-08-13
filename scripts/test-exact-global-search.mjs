import assert from "node:assert/strict";
import fs from "node:fs";
import { exactShortlistSize, optimizeOwnedDeck } from "../js/recommend.js";
import { optimizeRecommendationOrders } from "../js/order.js";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const leader = { id: "L", characterId: "char-L", characterName: "L", leader: { primaryCondition: [], primaryEffects: { p: 0, t: 0, s: 0, support: 0 }, additionalCondition: [], additionalEffects: { p: 0, t: 0, s: 0, support: 0 }, description: "" } };
function member(id, score, support, duration) {
  return { id, characterId: `char-${id}`, characterName: id, attribute: 1, groupings: new Set(), profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" }, stats: { p: 1000 + score, t: 1000, s: 1000 }, enhancementPermyriad: 0, passive: null, active: { level: 1, interval: 12, probability: 0.8, duration: 8, baseScoreUp: score, conditionalScoreUp: score, condition: null, description: id }, special: { level: 1, duration, support, activationRateUp: 0, condition: null, description: id } };
}
const rows = [member("A", 90, 80, 10), member("B", 75, 40, 16), member("C", 65, 120, 8), member("D", 55, 0, 20), member("E", 45, 60, 12), member("F", 35, 20, 18), member("G", 25, 100, 6)];
const preparedCards = new Map([leader, ...rows].map((row) => [row.id, row]));
const notes = Array.from({ length: 48 }, (_, index) => [index % 9 === 0 ? "flick" : "tap", 5 + index * 1.1]);
const chart = { fullComboNoteCount: notes.length, chartHash: "global-test", metadata: { notes, skills: [1,2,3,4,5].map((slot) => ({ slot, time: 4 + slot * 9, combo: slot * 8 })), fever: null } };
const exactMusic = { id: "global", title: "global", playing_seconds: 62, live_score_coefficient_permil: 5, _chart: chart, _scoreRules: rules };
const searchMusic = { ...exactMusic, _chart: { ...chart, metadata: null } };
const owned = ["L", ...rows.map((row) => row.id)];
const shortlist = exactShortlistSize(notes.length, owned.length);
assert.equal(shortlist, 30);
let staged = optimizeOwnedDeck({ preparedCards, ownedCardIds: owned, currentMembers: ["L", null, null, null, null, null], lockedSlots: [true, false, false, false, false, false], music: searchMusic, difficulty: "EXPERT", playMode: "manual", simulationTarget: "score", separateRole: true, resultCount: shortlist });
staged = optimizeRecommendationOrders({ recommendation: staged, preparedCards, currentMembers: ["L", null, null, null, null, null], lockedSlots: [true, false, false, false, false, false], music: exactMusic, difficulty: "EXPERT", playMode: "manual", simulationTarget: "score", separateRole: true, resultCount: 1 });

function combinations(values, size, start = 0, selected = [], out = []) { if (selected.length === size) { out.push([...selected]); return out; } for (let i = start; i <= values.length - (size - selected.length); i += 1) combinations(values, size, i + 1, [...selected, values[i]], out); return out; }
function permutations(values) { if (values.length <= 1) return [values]; const out=[]; values.forEach((value,index)=>{ const rest=[...values.slice(0,index),...values.slice(index+1)]; for (const tail of permutations(rest)) out.push([value,...tail]); }); return out; }
let best = -Infinity;
for (const combo of combinations(rows, 5)) {
  for (const order of permutations(combo)) {
    const result = evaluateDeck({ leader, members: order, music: exactMusic, difficulty: "EXPERT", playMode: "manual", separateRole: true, evaluationTarget: "score" });
    best = Math.max(best, result?.rankingScore ?? -Infinity);
  }
}
assert.equal(staged.score.rankingScore, best, `staged ${staged.score.rankingScore} != exhaustive ${best}`);
assert.ok(exactShortlistSize(2_022, 50) >= 12);
assert.ok(exactShortlistSize(700, 50) > 10);
console.log(`exact global-search regression: ${best}, shortlist ${shortlist}`);
