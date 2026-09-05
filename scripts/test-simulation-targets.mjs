import assert from "node:assert/strict";
import fs from "node:fs";
import { optimizeOwnedDeck } from "../js/recommend.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

function member(id, {
  parameter = 5000,
  activeScore = 0,
  probability = activeScore ? 1 : 0,
  interval = 20,
  duration = 10,
} = {}) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: parameter, t: 0, s: 0 },
    enhancementPermyriad: 0,
    passive: null,
    active: {
      level: 1,
      interval,
      probability,
      duration,
      baseScoreUp: activeScore,
      conditionalScoreUp: activeScore,
      condition: null,
      description: id,
    },
    special: {
      level: 1,
      duration: 0,
      support: 0,
      activationRateUp: 0,
      condition: null,
      description: id,
    },
  };
}

const leader = {
  id: "L",
  characterId: "char-L",
  characterName: "L",
  leader: {
    primaryCondition: [],
    primaryEffects: { p: 0, t: 0, s: 0, support: 0 },
    additionalCondition: [],
    additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
    description: "",
  },
};

const core = ["C1", "C2", "C3", "C4"].map((id) => member(id, { parameter: 20000 }));
const reliable = member("RELIABLE", { activeScore: 70, probability: 1 });
const volatile = member("VOLATILE", { activeScore: 220, probability: 0.2 });
const allMembers = [...core, reliable, volatile];
const preparedCards = new Map([leader, ...allMembers].map((row) => [row.id, row]));
const ownedCardIds = ["L", ...allMembers.map((row) => row.id)];
const currentMembers = ["L", null, null, null, null, null];
const lockedSlots = [true, false, false, false, false, false];

function optimize(simulationTarget, music = null) {
  const result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds,
    currentMembers,
    lockedSlots,
    music,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget,
    separateRole: true,
    resultCount: 1,
  });
  assert.equal(result.ok, true);
  return result;
}

function assertDivergence(music, label) {
  const expected = optimize("score", music);
  const potential = optimize("potential", music);
  console.log(`[target-debug] ${label}`, JSON.stringify({
    expectedMembers: expected.members,
    expectedRanking: expected.score.rankingScore,
    expectedPotential: expected.score.potentialRankingScore,
    expectedBonus: expected.score.scoreBonusPct,
    expectedPotentialBonus: expected.score.potentialScoreBonusPct,
    potentialMembers: potential.members,
    potentialRanking: potential.score.rankingScore,
    potentialPotential: potential.score.potentialRankingScore,
    potentialBonus: potential.score.scoreBonusPct,
    potentialPotentialBonus: potential.score.potentialScoreBonusPct,
  }));
  assert.ok(expected.members.includes("RELIABLE"), `${label}: expected target should keep RELIABLE`);
  assert.ok(!expected.members.includes("VOLATILE"), `${label}: expected target should drop VOLATILE`);
  assert.ok(potential.members.includes("VOLATILE"), `${label}: potential target should keep VOLATILE`);
  assert.ok(!potential.members.includes("RELIABLE"), `${label}: potential target should drop RELIABLE`);
  assert.ok(expected.score.rankingScore > potential.score.rankingScore,
    `${label}: expected-optimal deck should have the higher expectation`);
  assert.ok(potential.score.potentialRankingScore > expected.score.potentialRankingScore,
    `${label}: potential-optimal deck should have the higher ceiling`);
}

assertDivergence(null, "generic");

const notes = Array.from({ length: 220 }, (_, index) => ["tap", 1 + index * 0.5]);
const exactMusic = {
  id: "target-divergence",
  title: "Target Divergence",
  playing_seconds: 110,
  live_score_coefficient_permil: 5,
  _scoreRules: rules,
  _chart: {
    fullComboNoteCount: notes.length,
    chartHash: "target-divergence",
    metadata: { notes, skills: [], fever: null },
  },
};
assertDivergence(exactMusic, "exact");

console.log("simulation target divergence regression: OK");
