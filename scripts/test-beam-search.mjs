import assert from "node:assert/strict";
import { memberCandidatePool, optimizeOwnedDeck } from "../js/recommend.js";
import { dedupeRecommendationResults } from "../js/order.js";

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

function searchCard(id, {
  rarity = 5,
  parameter = 10000,
  attribute = 1,
  groupings = [],
  leaderCondition = [],
  characterId = null,
} = {}) {
  return {
    id,
    raw: { rarity },
    characterId: characterId ?? `char-${id}`,
    characterName: id,
    attribute,
    groupings: new Set(groupings),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "max" },
    stats: { p: parameter, t: 0, s: 0 },
    enhancementPermyriad: 0,
    passive: null,
    active: {
      level: 1,
      interval: 20,
      probability: 0,
      duration: 0,
      baseScoreUp: 0,
      conditionalScoreUp: 0,
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
    leader: {
      primaryCondition: leaderCondition,
      primaryEffects: { p: 0, t: 0, s: 0, support: 0 },
      additionalCondition: [],
      additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
      description: "",
    },
  };
}

// The Exact threshold is applied per leader rather than to the global sum of all leaders.
{
  const rows = Array.from({ length: 12 }, (_, index) => searchCard(`E${index}`, { parameter: 10000 + index * 100 }));
  const exactPerLeader = optimizeOwnedDeck({
    preparedCards: new Map(rows.map((row) => [row.id, row])),
    ownedCardIds: rows.map((row) => row.id),
    currentMembers: [null, null, null, null, null, null],
    lockedSlots: [false, false, false, false, false, false],
    simulationTarget: "score",
    separateRole: true,
    resultCount: 5,
    exactCaseLimit: 500,
  });
  assert.equal(exactPerLeader.ok, true);
  assert.equal(exactPerLeader.searchMode, "exact");
  assert.equal(exactPerLeader.exactLeaderCount, 12);
  assert.equal(exactPerLeader.beamLeaderCount, 0);
  assert.equal(exactPerLeader.prunedLeaderCount, 0);
  assert.equal(exactPerLeader.evaluatedCount, 12 * 462);
}

// Mixed-rarity pruning keeps every 5-star and protects a 4-star that satisfies the leader condition.
{
  const conditionLeader = searchCard("COND-L", {
    leaderCondition: [{ kind: "group", value: "needed", count: 1 }],
  });
  const fiveStars = Array.from({ length: 25 }, (_, index) => searchCard(`F5-${index}`, {
    rarity: 5,
    parameter: 20000 + index,
  }));
  const fourStars = Array.from({ length: 20 }, (_, index) => searchCard(`F4-${index}`, {
    rarity: 4,
    parameter: 5000 + index,
  }));
  fourStars[0].groupings.add("needed");
  const pool = memberCandidatePool([...fiveStars, ...fourStars], conditionLeader, [], "score");
  assert.equal(pool.filter((row) => Number(row.raw.rarity) === 5).length, fiveStars.length);
  assert.ok(pool.some((row) => row.id === "F4-0"), "leader-condition 4-star was pruned");
  assert.ok(pool.length < fiveStars.length + fourStars.length, "mixed pool was not pruned");
}

// A large 4-star tail cannot displace a stronger 5-star core after the high-rarity refinement pass.
{
  const lockedLeader = searchCard("LOCKED-L");
  const fiveStars = Array.from({ length: 6 }, (_, index) => searchCard(`CORE-${index}`, {
    rarity: 5,
    parameter: 30000 - index * 1000,
  }));
  const fourStars = Array.from({ length: 40 }, (_, index) => searchCard(`TAIL-${index}`, {
    rarity: 4,
    parameter: 5000 + index,
  }));
  const rows = [lockedLeader, ...fiveStars, ...fourStars];
  const refined = optimizeOwnedDeck({
    preparedCards: new Map(rows.map((row) => [row.id, row])),
    ownedCardIds: rows.map((row) => row.id),
    currentMembers: [lockedLeader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    simulationTarget: "score",
    separateRole: true,
    resultCount: 5,
  });
  assert.equal(refined.ok, true);
  assert.equal(refined.prunedLeaderCount, 1);
  assert.equal(refined.refinedLeaderCount, 1);
  assert.ok(refined.refinementEvaluatedCount > 0);
  assert.deepEqual(new Set(refined.members.slice(1)), new Set(fiveStars.slice(0, 5).map((row) => row.id)));
}

// A wider second-pass Beam recovers a synergy island that is individually weaker than filler cards.
{
  const lockedLeader = searchCard("ISLAND-L");
  const synergy = Array.from({ length: 5 }, (_, index) => searchCard(`ISLAND-${index}`, {
    rarity: 5,
    parameter: 9000,
    groupings: ["island"],
  }));
  synergy.forEach((row) => {
    row.passive = {
      level: 1,
      description: "island synergy",
      condition: { kind: "group", value: "island", count: 5 },
      effect: { kind: "all", stat: null, value: 100, target: { kind: "all", count: 5 } },
    };
  });
  const fillers = Array.from({ length: 34 }, (_, index) => searchCard(`ISLAND-FILLER-${index}`, {
    rarity: 5,
    parameter: 10000,
  }));
  const rows = [lockedLeader, ...synergy, ...fillers];
  const islandCommon = {
    preparedCards: new Map(rows.map((row) => [row.id, row])),
    ownedCardIds: rows.map((row) => row.id),
    currentMembers: [lockedLeader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    simulationTarget: "score",
    separateRole: true,
    resultCount: 5,
  };
  const refined = optimizeOwnedDeck(islandCommon);
  const exhaustive = optimizeOwnedDeck({ ...islandCommon, exactCaseLimit: 1_000_000 });
  assert.equal(refined.ok, true);
  assert.equal(exhaustive.ok, true);
  assert.equal(refined.searchMode, "beam");
  assert.equal(refined.results[0].rankingValue, exhaustive.results[0].rankingValue);
  assert.deepEqual(
    new Set(refined.members.slice(1)),
    new Set(synergy.map((row) => row.id)),
    "second-pass refinement missed the five-card synergy island",
  );
}

// Different cards of the same holomem can never coexist in member slots.
{
  const lockedLeader = searchCard("UNIQUE-L");
  const flareNormal = searchCard("FLARE-NORMAL", {
    parameter: 50000,
    characterId: "char-flare",
  });
  const flareSwim = searchCard("FLARE-SWIM", {
    parameter: 49000,
    characterId: "char-flare",
  });
  const fillers = Array.from({ length: 4 }, (_, index) => searchCard(`UNIQUE-FILLER-${index}`, {
    parameter: 10000 - index * 100,
  }));
  const rows = [lockedLeader, flareNormal, flareSwim, ...fillers];
  const uniqueCommon = {
    preparedCards: new Map(rows.map((row) => [row.id, row])),
    ownedCardIds: rows.map((row) => row.id),
    currentMembers: [lockedLeader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    simulationTarget: "score",
    separateRole: true,
    resultCount: 5,
  };

  for (const exactCaseLimit of [1_000_000, 1]) {
    const result = optimizeOwnedDeck({ ...uniqueCommon, exactCaseLimit });
    assert.equal(result.ok, true);
    for (const candidate of result.results) {
      const selected = candidate.members.slice(1).map((id) => uniqueCommon.preparedCards.get(id));
      const characterIds = selected.map((row) => row.characterId);
      assert.equal(new Set(characterIds).size, characterIds.length,
        "same holomem variants appeared together in a recommended deck");
      assert.ok(!(candidate.members.includes(flareNormal.id) && candidate.members.includes(flareSwim.id)),
        "normal and swimsuit variants of the same holomem were selected together");
    }
  }

  const invalidPreset = optimizeOwnedDeck({
    ...uniqueCommon,
    currentMembers: [lockedLeader.id, flareNormal.id, flareSwim.id, null, null, null],
    lockedSlots: [true, true, true, false, false, false],
  });
  assert.equal(invalidPreset.ok, false);
  assert.match(invalidPreset.reason, /같은 홀로멤/);
}

// Member order is not a distinct result, but changing the leader still is.
{
  const score = (value) => ({ rankingScore: value, unitScore: value });
  const deduped = dedupeRecommendationResults([
    { members: ["L1", "A", "B", "C", "D", "E"], score: score(100), rankingValue: 100 },
    { members: ["L1", "E", "D", "C", "B", "A"], score: score(110), rankingValue: 110 },
    { members: ["L2", "A", "B", "C", "D", "E"], score: score(105), rankingValue: 105 },
  ]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].rankingValue, 110);
  assert.equal(deduped[1].members[0], "L2");
}

console.log("beam-search quality/pruning regression: OK");