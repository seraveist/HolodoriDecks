import assert from "node:assert/strict";
import { optimizeOwnedDeck } from "../js/recommend.js";

function member(index) {
  const activeScore = 20 + index * 7;
  const probability = Math.max(0.35, 0.95 - index * 0.04);
  return {
    id: `M${index}`,
    characterId: `char-M${index}`,
    characterName: `M${index}`,
    attribute: (index % 3) + 1,
    groupings: new Set(index % 2 ? ["g-odd"] : ["g-even"]),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 4000 + index * 900, t: 3500 + index * 450, s: 3000 + index * 300 },
    enhancementPermyriad: 0,
    passive: null,
    active: {
      level: 1,
      interval: 13 + (index % 5) * 2,
      probability,
      duration: 6 + (index % 4),
      baseScoreUp: activeScore,
      conditionalScoreUp: activeScore,
      condition: null,
      description: `M${index}`,
    },
    special: {
      level: 1,
      duration: 0,
      support: 0,
      activationRateUp: 0,
      condition: null,
      description: `M${index}`,
    },
  };
}

const leader = {
  id: "L",
  characterId: "char-L",
  characterName: "L",
  leader: {
    primaryCondition: [],
    primaryEffects: { p: 15, t: 10, s: 5, support: 0 },
    additionalCondition: [],
    additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
    description: "",
  },
};

const members = Array.from({ length: 12 }, (_, index) => member(index));
const preparedCards = new Map([leader, ...members].map((row) => [row.id, row]));
const common = {
  preparedCards,
  ownedCardIds: ["L", ...members.map((row) => row.id)],
  currentMembers: ["L", null, null, null, null, null],
  lockedSlots: [true, false, false, false, false, false],
  music: null,
  difficulty: "EXPERT",
  playMode: "manual",
  separateRole: true,
  resultCount: 1,
};

for (const simulationTarget of ["score", "potential"]) {
  const exact = optimizeOwnedDeck({ ...common, simulationTarget, exactCaseLimit: 1_000_000 });
  const beam = optimizeOwnedDeck({ ...common, simulationTarget, exactCaseLimit: 1 });
  assert.equal(exact.ok, true);
  assert.equal(beam.ok, true);
  assert.equal(exact.searchMode, "exact");
  assert.equal(beam.searchMode, "beam");
  assert.equal(beam.score.rankingScore, exact.score.rankingScore,
    `${simulationTarget}: beam expectation drifted from exhaustive result`);
  assert.equal(beam.score.potentialRankingScore, exact.score.potentialRankingScore,
    `${simulationTarget}: beam potential drifted from exhaustive result`);
  assert.deepEqual(new Set(beam.members), new Set(exact.members),
    `${simulationTarget}: beam selected a different deck from exhaustive search`);
}

console.log("beam-search quality regression: OK");
