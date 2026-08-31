import assert from "node:assert/strict";
import { optimizeOwnedDeck } from "../js/recommend.js";

function member(id, {
  parameter = 10000,
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

function run({ bParameter, cParameter }) {
  const A = member("A", { parameter: 12000, activeScore: 100, interval: 20, duration: 10 });
  const cores = ["C1", "C2", "C3"].map((id) => member(id, { parameter: 25000 }));
  const B = member("B", { parameter: bParameter, activeScore: 90, interval: 20, duration: 10 });
  const C = member("C", { parameter: cParameter, activeScore: 40, interval: 17, duration: 8 });
  const preparedCards = new Map([leader, A, ...cores, B, C].map((row) => [row.id, row]));
  const result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds: ["L", "A", ...cores.map((row) => row.id), "B", "C"],
    currentMembers: ["L", "A", "C1", "C2", "C3", null],
    lockedSlots: [true, true, true, true, true, false],
    music: null,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget: "score",
    separateRole: true,
    resultCount: 1,
  });
  assert.equal(result.ok, true);
  return result;
}

const sameParameter = run({ bParameter: 10000, cParameter: 10000 });
assert.ok(sameParameter.members.includes("B"),
  "unit-score Active must use independent expectation instead of penalizing B for A's same cycle");
assert.ok(!sameParameter.members.includes("C"),
  "a weaker different-cycle Active must not win solely by avoiding a Unit Score collision penalty");

const parameterAdvantage = run({ bParameter: 30000, cParameter: 10000 });
assert.ok(parameterAdvantage.members.includes("B"),
  "same-cycle B must remain eligible when it also has a parameter advantage");
assert.ok(!parameterAdvantage.members.includes("C"),
  "same-cycle overlap remains a song-timeline concern, not a Unit Score hard/soft penalty");

console.log("unit active independent-overlap regression: OK");
