import assert from "node:assert/strict";
import fs from "node:fs";
import { runOptimization } from "../js/optimizer-core.js";
import { evaluateDeck } from "../js/score.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

const leader = {
  id: "L",
  characterId: "char-L",
  characterName: "L",
  leader: {
    primaryCondition: [],
    primaryEffects: { p: 8, t: 5, s: 3, support: 0 },
    additionalCondition: [],
    additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
    description: "",
  },
};

function member(index) {
  return {
    id: `M${index}`,
    characterId: `char-M${index}`,
    characterName: `M${index}`,
    attribute: (index % 3) + 1,
    groupings: new Set(index % 2 ? ["odd"] : ["even"]),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: {
      p: 4500 + index * 750,
      t: 3200 + (9 - index) * 280,
      s: 2800 + (index % 4) * 500,
    },
    enhancementPermyriad: 0,
    passive: null,
    active: {
      level: 1,
      interval: 12 + (index % 4) * 3,
      probability: 0.55 + (index % 5) * 0.08,
      duration: 6 + (index % 3) * 2,
      baseScoreUp: 30 + index * 8,
      conditionalScoreUp: 30 + index * 8,
      condition: null,
      description: `M${index}`,
    },
    special: {
      level: 1,
      duration: 7 + (index % 5) * 2,
      support: (index % 4) * 25,
      activationRateUp: index % 3 === 0 ? 20 : 0,
      condition: null,
      description: `M${index}`,
    },
  };
}

const rows = Array.from({ length: 10 }, (_, index) => member(index));
const preparedCards = new Map([leader, ...rows].map((row) => [row.id, row]));
const notes = Array.from({ length: 96 }, (_, index) => [
  index % 11 === 0 ? "flick" : "tap",
  4 + index * 0.85,
]);
const skills = [1, 2, 3, 4, 5].map((slot) => ({
  slot,
  time: 8 + slot * 14,
  combo: slot * 16,
}));
const chart = {
  fullComboNoteCount: notes.length,
  chartHash: "pruning-test",
  metadata: { notes, skills, fever: null },
};
const exactMusic = {
  id: "pruning",
  title: "pruning",
  playing_seconds: 92,
  live_score_coefficient_permil: 5,
  _chart: chart,
  _scoreRules: rules,
};
const searchMusic = { ...exactMusic, _chart: { ...chart, metadata: null } };
const ownedCardIds = ["L", ...rows.map((row) => row.id)];

function combinations(values, size, start = 0, selected = [], output = []) {
  if (selected.length === size) {
    output.push([...selected]);
    return output;
  }
  for (let index = start; index <= values.length - (size - selected.length); index += 1) {
    combinations(values, size, index + 1, [...selected, values[index]], output);
  }
  return output;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const output = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) output.push([value, ...tail]);
  });
  return output;
}

function rankingValue(score, target) {
  return target === "potential" ? score.potentialRankingScore : score.rankingScore;
}

const allCombinations = combinations(rows, 5);
assert.equal(allCombinations.length, 252);
assert.ok(allCombinations.length > 30, "fixture must actually prune stage-one candidates");

for (const simulationTarget of ["score", "potential"]) {
  const staged = runOptimization({
    preparedCards,
    ownedCardIds,
    currentMembers: ["L", null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    searchMusic,
    exactMusic,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget,
    separateRole: true,
    hasExactOrder: true,
    resultCount: 1,
  });
  assert.equal(staged.ok, true);
  assert.equal(staged.stageOneShortlistCount, 30);
  assert.equal(staged.orderOptimization.mode, "exact");
  assert.equal(staged.orderOptimization.shortlistedCount, 30);

  let exhaustiveBest = -Infinity;
  for (const combination of allCombinations) {
    for (const order of permutations(combination)) {
      const score = evaluateDeck({
        leader,
        members: order,
        music: exactMusic,
        difficulty: "EXPERT",
        playMode: "manual",
        separateRole: true,
        evaluationTarget: simulationTarget,
      });
      exhaustiveBest = Math.max(exhaustiveBest, rankingValue(score, simulationTarget));
    }
  }

  assert.equal(rankingValue(staged.score, simulationTarget), exhaustiveBest,
    `${simulationTarget}: pruned staged search missed the exhaustive global optimum`);
}

console.log("Exact shortlist pruning regression: OK");
