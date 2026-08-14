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

const avoidCollision = run({ bParameter: 10000, cParameter: 10000 });
assert.ok(avoidCollision.members.includes("C"),
  "different-cycle C should beat same-cycle B when their base parameter is equal");
assert.ok(!avoidCollision.members.includes("B"),
  "same-cycle B should be dropped when collision loss makes it inferior");

const tolerateCollision = run({ bParameter: 30000, cParameter: 10000 });
assert.ok(tolerateCollision.members.includes("B"),
  "same-cycle B must remain eligible when its parameter advantage beats the collision loss");
assert.ok(!tolerateCollision.members.includes("C"),
  "collision is a score penalty, not a hard exclusion rule");

console.log("same-cycle soft-constraint regression: OK");
