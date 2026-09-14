import assert from "node:assert/strict";
import { evaluateDeck } from "../js/score.js";

const leader = (support = 0) => ({
  id: "leader", characterId: "leader",
  leader: { primaryCondition: [], additionalCondition: [], primaryEffects: { support }, additionalEffects: {} },
});
const member = (id, score = 100) => ({
  id, characterId: id, characterName: id, attribute: 1, groupings: new Set(),
  stats: { p: 1000, t: 1000, s: 1000 },
  profile: { level: 80, potential: 0 }, passive: null,
  active: { interval: 10, duration: 10, probability: score ? 1 : 0, baseScoreUp: score, conditionalScoreUp: score, condition: null },
  special: { duration: 0, support: 0, activationRateUp: 0, condition: null },
});
const members = ["A", "B", "C", "D", "E"].map(id => member(id));
members[0].special = { duration: 11, support: 100, activationRateUp: 0, condition: null };
members[1].passive = { condition: null, effect: { kind: "support", value: 5, target: { kind: "all", count: 5 } } };
const unit = evaluateDeck({ leader: leader(20), members });
// 191/200 active samples gives 95.5. SP uses ceil2(100*11/120)=9.17,
// then ceil1(95.5*9.17/100)=8.8, independent of the legacy costume estimate.
assert.deepEqual(unit.detail.scoreBonus, { outfit: 20, active: 95.5, board: 0, passive: 5, special: 8.8 });
assert.equal(unit.scoreBonusPct, 129.3);
assert.equal(unit.potentialScoreBonusPct, 129.3);

const music = { id: "support-addition", playing_seconds: 110, live_score_coefficient_permil: 5 };
const aggregate = evaluateDeck({ leader: leader(20), members, music });
// The aggregate path excludes the first 10 seconds before the initial check.
const aggregateMultiplier = 1 + 1.35 * 100 / 110;
assert.ok(Math.abs(aggregate.songProjection.expected.skillMultiplier - aggregateMultiplier) < 1e-12,
  "Aggregate song support must add SP to static support before averaging");
assert.ok(Math.abs(aggregate.songProjection.maximum.skillMultiplier - aggregateMultiplier) < 1e-12);

// Different intervals must use their joint windows, including the song end.
// A: [10,20), [20,25); B: [15,25), both 50% likely to activate.
// [10,15): E=50%, [15,25): E=max(A100,B200)=125%.
const overlapMembers = [member("A", 100), member("B", 200), ...["C", "D", "E"].map(id => member(id, 0))];
overlapMembers[0].active.probability = 0.5;
overlapMembers[1].active = { ...overlapMembers[1].active, interval: 15, probability: 0.5 };
const overlapSong = { id: "joint-active-windows", playing_seconds: 25, live_score_coefficient_permil: 5 };
const overlap = evaluateDeck({ leader: leader(), members: overlapMembers, music: overlapSong, includeDiagnostics: true });
assert.ok(Math.abs(overlap.songProjection.expected.skillMultiplier - 1.6) < 1e-12);
assert.ok(Math.abs(overlap.songProjection.maximum.skillMultiplier - 2) < 1e-12);
assert.ok(Math.abs(overlap.diagnostics[0].coverage - 0.3) < 1e-12, "song diagnostics must use clipped song coverage");
const singleMaximum = evaluateDeck({ leader: leader(), members: overlapMembers, music: overlapSong, evaluationTarget: "potential" });
assert.equal(singleMaximum.potentialRankingScore, overlap.potentialRankingScore);

const exactMusic = { ...music, _chart: { chartHash: "support-addition-exact", fullComboNoteCount: 3,
  metadata: { notes: [["tap", 12], ["tap", 15], ["tap", 19]], skills: [{ slot: 1, time: 10, combo: 0 }], fever: null } } };
const exact = evaluateDeck({ leader: leader(20), members, music: exactMusic });
// At these note times the whole 100% SP is active: 100 × (1 + .20 + .05 + 1).
assert.ok(Math.abs(exact.songProjection.expected.skillMultiplier - 3.25) < 1e-12);
assert.ok(Math.abs(exact.songProjection.maximum.skillMultiplier - 3.25) < 1e-12);

// Adding the same SP support to everyone can change which Active is strongest.
const crossing = [member("A", 100), member("B", 125), ...["C", "D", "E"].map(id => member(id, 0))];
crossing[0].passive = { condition: null, effect: { kind: "support", value: 30, target: { kind: "self", count: 1 } } };
for (const m of crossing) m.special = { duration: 11, support: 120, activationRateUp: 0, condition: null };
const reranked = evaluateDeck({ leader: leader(), members: crossing });
// Formation detail uses normalized Active means; song winner selection above
// still uses additive support on the actual song's time axis.
assert.deepEqual(reranked.detail.scoreBonus, { outfit: 0, active: 107.5, board: 0, passive: 14.3, special: 59.2 });
assert.equal(reranked.scoreBonusPct, 181);

// Only the costume fallback retains legacy leader-supported competition.
// In that model A reaches 130 without a leader. With +60% leader support,
// A reaches 190 while B reaches 200, so A's passive contributes no marginal
// gain. Freezing the no-leader passive at 5 would misattribute that gain.
const leaderCompetition = [member("P", 100), member("Q", 125), ...["R", "S", "T"].map(id => member(id, 0))];
leaderCompetition[0].passive = { condition: null, effect: { kind: "support", value: 30, target: { kind: "self", count: 1 } } };
const noLeaderSupport = evaluateDeck({ leader: leader(), members: leaderCompetition });
const withLeaderSupport = evaluateDeck({ leader: leader(60), members: leaderCompetition });
assert.equal(noLeaderSupport.detail.scoreBonus.passive, 14.3);
assert.equal(withLeaderSupport.detail.scoreBonus.passive, 0);
assert.deepEqual(withLeaderSupport.detail.scoreBonus, { outfit: 75, active: 107.5, board: 0, passive: 0, special: 0 });
assert.equal(withLeaderSupport.scoreBonusPct, 182.5);
assert.equal(withLeaderSupport.potentialScoreBonusPct, 182.5);
console.log("support stacking: additive sources, SP winner change, leader-aware Passive attribution: OK");
