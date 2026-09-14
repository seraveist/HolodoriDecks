import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSongContext,
  songKernel,
  timelineSongProjection,
} from "../js/chart-score.js";
import { evaluateDeck } from "../js/score.js";
import { optimizeRecommendationOrders } from "../js/order.js";
import { optimizeOwnedDeck } from "../js/recommend.js";

const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));

function member(id, {
  activeScore = 0,
  interval = 15,
  duration = 10,
  probability = activeScore ? 1 : 0,
  specialSupport = 0,
  specialDuration = 20,
  specialRate = 0,
} = {}) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 1000, t: 1000, s: 1000 },
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
      description: `${id} active`,
    },
    special: {
      level: 1,
      duration: specialDuration,
      support: specialSupport,
      activationRateUp: specialRate,
      condition: null,
      description: `${id} special`,
    },
  };
}

function leader() {
  return {
    id: "L",
    characterId: "char-L",
    characterName: "Leader",
    leader: {
      primaryCondition: [],
      primaryEffects: { p: 0, t: 0, s: 0, support: 0 },
      additionalCondition: [],
      additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
      description: "test leader",
    },
  };
}

function exactChart() {
  const notes = [];
  // Dense early section: slot 1 SP support is much more valuable than slot 2.
  for (let second = 15; second <= 24; second += 1) notes.push(["tap", second]);
  notes.push(["flick", 45]);
  return {
    fullComboNoteCount: notes.length,
    chartHash: "test-chart",
    chartAssetId: "chart_test_expert",
    metadata: {
      notes,
      skills: [
        { slot: 1, time: 10, combo: 0 },
        { slot: 2, time: 40, combo: 10 },
        { slot: 3, time: 48, combo: 11 },
        { slot: 4, time: 52, combo: 11 },
        { slot: 5, time: 56, combo: 11 },
      ],
      fever: { start: 30, end: 40 },
    },
  };
}

// Master chart count replaces density estimation even without exact SUS metadata.
{
  const context = buildSongContext(
    { title: "Master Count", playing_seconds: 100, live_score_coefficient_permil: 5 },
    "EXPERT",
    { fullComboNoteCount: 415, metadata: null, chartHash: "hash" },
  );
  assert.equal(context.chartAccuracy, "master");
  assert.equal(context.notes, 415);
  assert.equal(context.fullComboNoteCount, 415);
}

// Exact metadata wins over master count and keeps SP/Fever timeline data.
{
  const chart = exactChart();
  const context = buildSongContext(
    { title: "Exact", playing_seconds: 60, live_score_coefficient_permil: 5 },
    "EXPERT",
    chart,
  );
  assert.equal(context.chartAccuracy, "exact");
  assert.equal(context.notes, chart.metadata.notes.length);
  assert.equal(context.skillTimeline.length, 5);
  assert.deepEqual(context.fever, { start: 30, end: 40 });
}

// Master score coefficients and combo curve are generated correctly.
{
  assert.equal(rules.noteWeights.manual.tap, 1);
  assert.equal(rules.noteWeights.manual.flick, 1.05);
  assert.equal(rules.noteWeights.auto.tap, 0.8);
  assert.equal(rules.noteWeights.auto.long_relay, 0.1);
  assert.equal(rules.combo.find((row) => row.from === 1000)?.scoreUpPct, 10);

  const context = {
    notes: 2,
    coefficient: 5,
    noteTimeline: [["tap", 1], ["flick", 2]],
  };
  assert.equal(songKernel(context, "manual", rules), (1 + 1.05) * 5);
  assert.equal(songKernel(context, "auto", rules), (0.8 + 0.8) * 5);
}

const A = member("A", { specialSupport: 100, specialDuration: 20 });
const B = member("B");
const C = member("C", { activeScore: 100, interval: 15, duration: 10 });
const D = member("D");
const E = member("E");
const chart = exactChart();
const song = {
  id: "mtest",
  title: "Synthetic SP Order",
  playing_seconds: 60,
  live_score_coefficient_permil: 5,
  _chart: chart,
  _scoreRules: rules,
};
const context = buildSongContext(song, "EXPERT", chart);
const genericContext = {
  kind: "generic",
  duration: 60,
  notes: context.notes,
  coefficient: 5,
  noteTimeline: [],
  skillTimeline: [],
  chartAccuracy: "generic",
};

// SP slot order changes exact expected score.
{
  const earlySupport = timelineSongProjection({
    baseScore: 100000,
    members: [A, B, C, D, E],
    context,
    genericContext,
    fullSupportPct: 0,
    playMode: "manual",
    scoreRules: rules,
  });
  const lateSupport = timelineSongProjection({
    baseScore: 100000,
    members: [B, A, C, D, E],
    context,
    genericContext,
    fullSupportPct: 0,
    playMode: "manual",
    scoreRules: rules,
  });
  assert.ok(earlySupport.averageScore > lateSupport.averageScore,
    `expected slot-1 support (${earlySupport.averageScore}) > slot-2 support (${lateSupport.averageScore})`);
  assert.equal(earlySupport.specialWindows[0].cardId, "A");
  assert.equal(lateSupport.specialWindows[1].cardId, "A");
}

const L = leader();

// The song boundary must not expire a skill which actually continues beyond
// the final note. A real runtime chart (m0327:EXPERT) ends after playing_seconds.
{
  const support = member("END-SP", { specialSupport: 100, specialDuration: 10 });
  const active = member("END-ACTIVE", { activeScore: 100, interval: 10, duration: 10 });
  const endMembers = [support, active, B, D, E];
  const endSong = {
    id: "end-boundary", playing_seconds: 14, live_score_coefficient_permil: 5,
    _chart: { fullComboNoteCount: 2, metadata: {
      notes: [["tap", 10], ["tap", 15]], skills: [{ slot: 1, time: 10, combo: 1 }],
    } },
  };
  const result = evaluateDeck({ leader: L, members: endMembers, music: endSong });
  assert.equal(result.songProjection.context.duration, 15);
  assert.ok(Math.abs(result.songProjection.expected.skillMultiplier - 3) < 1e-12, "Active and SP must still cover the final note");
  assert.equal(result.songProjection.specialWindows[0].end, 15, "display window remains clipped to the song");
  const expiring = { ...support, special: { ...support.special, duration: 5 } };
  const expired = evaluateDeck({ leader: L, members: [expiring, ...endMembers.slice(1)], music: endSong });
  assert.ok(Math.abs(expired.songProjection.expected.skillMultiplier - 2.5) < 1e-12, "a true SP expiration excludes that note");
  const startsOnFinalNote = { ...active, active: { ...active.active, interval: 15 } };
  const finalStart = evaluateDeck({ leader: L, members: [support, startsOnFinalNote, B, D, E], music: endSong });
  assert.ok(Math.abs(finalStart.songProjection.expected.skillMultiplier - 2) < 1e-12, "a check at the final note can still activate");
}

// A song's five SP positions affect its expected and potential live scores,
// while the same cards retain their generic Unit/Potential Unit scores.
{
  const PC = member("PC", { activeScore: 100, interval: 15, duration: 10, probability: 0.5 });
  const earlyOrder = [A, B, PC, D, E];
  const lateOrder = [B, A, PC, D, E];
  const generic = evaluateDeck({ leader: L, members: earlyOrder });
  const genericLate = evaluateDeck({ leader: L, members: lateOrder });
  const evaluateOrder = members => evaluateDeck({ leader: L, members, music: song, playMode: "manual" });
  const early = evaluateOrder(earlyOrder);
  const late = evaluateOrder(lateOrder);
  assert.equal(generic.unitScore, genericLate.unitScore);
  assert.equal(generic.potentialUnitScore, genericLate.potentialUnitScore);
  for (const score of [early, late]) {
    assert.equal(score.unitScore, generic.unitScore);
    assert.equal(score.potentialUnitScore, generic.potentialUnitScore);
    assert.equal(score.songProjection.specialWindows.length, 5);
    assert.deepEqual(score.songProjection.specialWindows.map(w => w.start), [10, 40, 48, 52, 56]);
    assert.ok(score.potentialRankingScore > score.rankingScore);
  }
  assert.deepEqual(early.songProjection.specialWindows.map(w => w.cardId), earlyOrder.map(m => m.id));
  assert.deepEqual(late.songProjection.specialWindows.map(w => w.cardId), lateOrder.map(m => m.id));
  assert.ok(early.rankingScore > late.rankingScore, "SP support in the dense section must improve expected score");
  assert.ok(early.potentialRankingScore > late.potentialRankingScore, "SP support placement must also improve potential score");

  const rateOnly = member("RATE", { specialSupport: 0, specialRate: 50, specialDuration: 20 });
  const earlyRate = evaluateOrder([rateOnly, B, PC, D, E]);
  const lateRate = evaluateOrder([B, rateOnly, PC, D, E]);
  assert.ok(earlyRate.rankingScore > lateRate.rankingScore, "SP rate boosts act at the actual Active checks");
  assert.equal(earlyRate.potentialRankingScore, lateRate.potentialRankingScore,
    "Rate-only SP cannot raise an all-success potential ceiling");
}

const preparedCards = new Map([L, A, B, C, D, E].map((card) => [card.id, card]));
const baseline = evaluateDeck({
  leader: L,
  members: [B, A, C, D, E],
  music: song,
  difficulty: "EXPERT",
  playMode: "manual",
  separateRole: true,
});
assert.ok(baseline);

const recommendation = {
  ok: true,
  results: [{
    members: ["L", "B", "A", "C", "D", "E"],
    score: baseline,
    rankingValue: baseline.rankingScore,
  }],
  members: ["L", "B", "A", "C", "D", "E"],
  score: baseline,
};

// Full order optimizer checks 5! permutations, preserves the selected five cards,
// and chooses the high-value Special Support card for slot 1.
{
  const optimized = optimizeRecommendationOrders({
    recommendation,
    preparedCards,
    currentMembers: [null, null, null, null, null, null],
    lockedSlots: [false, false, false, false, false, false],
    music: song,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget: "score",
    separateRole: true,
    resultCount: 1,
  });

  assert.equal(optimized.orderOptimization.mode, "exact");
  assert.equal(optimized.orderOptimization.evaluatedCount, 120);
  assert.equal(optimized.members[0], "L");
  assert.equal(optimized.members[1], "A");
  assert.deepEqual(new Set(optimized.members.slice(1)), new Set(["A", "B", "C", "D", "E"]));
  assert.ok(optimized.score.rankingScore > baseline.rankingScore);
}

// Potential optimization retains the five-SP order search too.
{
  const optimizedPotential = optimizeRecommendationOrders({
    recommendation: structuredClone(recommendation), preparedCards,
    currentMembers: ["L", "B", "A", "C", "D", "E"], lockedSlots: Array(6).fill(true),
    music: song, difficulty: "EXPERT", playMode: "manual", simulationTarget: "potential", separateRole: true, resultCount: 1,
  });
  assert.equal(optimizedPotential.orderOptimization.evaluatedCount, 120);
  assert.equal(optimizedPotential.members[1], "A");
  assert.ok(optimizedPotential.score.potentialRankingScore > baseline.potentialRankingScore);
}

// Preset member slots are inclusion constraints, not position locks. Even when B and A
// came from locked preset slots 1 and 2, exact SP optimization must still examine 5! orders.
{
  const optimizedPreset = optimizeRecommendationOrders({
    recommendation,
    preparedCards,
    currentMembers: ["L", "B", "A", null, null, null],
    lockedSlots: [true, true, true, false, false, false],
    music: song,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget: "score",
    separateRole: true,
    resultCount: 1,
  });

  assert.equal(optimizedPreset.orderOptimization.mode, "exact");
  assert.equal(optimizedPreset.orderOptimization.evaluatedCount, 120);
  assert.equal(optimizedPreset.members[0], "L");
  assert.equal(optimizedPreset.members[1], "A");
  assert.deepEqual(new Set(optimizedPreset.members.slice(1)), new Set(["A", "B", "C", "D", "E"]));
}

// Preset members are inclusion constraints from the first search stage, not positional locks.
{
  const L = leader();
  const preparedCards = new Map([L, A, B, C, D, E].map((card) => [card.id, card]));
  const result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds: ["L", "A", "B", "C", "D", "E"],
    currentMembers: ["L", null, null, null, "A", null],
    lockedSlots: [true, false, false, false, true, false],
    music: null,
    difficulty: "EXPERT",
    playMode: "manual",
    simulationTarget: "score",
    separateRole: true,
    resultCount: 1,
  });
  assert.equal(result.ok, true);
  assert.ok(result.members.includes("A"));
  assert.equal(result.members[1], "A");
  assert.notEqual(result.members[4], "A");
}

console.log("chart timeline scoring tests: OK");
