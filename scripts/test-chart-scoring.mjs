import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSongContext,
  songKernel,
  timelineSongProjection,
} from "../js/chart-score.js";
import { evaluateDeck } from "../js/score.js";
import { optimizeRecommendationOrders } from "../js/order.js";

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
  assert.equal(context.skillTimeline.length, 2);
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
    unitScore: 100000,
    members: [A, B, C, D, E],
    context,
    genericContext,
    fullSupportPct: 0,
    playMode: "manual",
    genericSkillMultiplier: 1,
    scoreRules: rules,
  });
  const lateSupport = timelineSongProjection({
    unitScore: 100000,
    members: [B, A, C, D, E],
    context,
    genericContext,
    fullSupportPct: 0,
    playMode: "manual",
    genericSkillMultiplier: 1,
    scoreRules: rules,
  });
  assert.ok(earlySupport.averageScore > lateSupport.averageScore,
    `expected slot-1 support (${earlySupport.averageScore}) > slot-2 support (${lateSupport.averageScore})`);
  assert.equal(earlySupport.specialWindows[0].cardId, "A");
  assert.equal(lateSupport.specialWindows[1].cardId, "A");
}

// Full order optimizer checks 5! permutations, preserves the selected five cards,
// and chooses the high-value Special Support card for slot 1.
{
  const L = leader();
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
  assert.equal(optimized.members[1], "A");
  assert.deepEqual(new Set(optimized.members.slice(1)), new Set(["A", "B", "C", "D", "E"]));
  assert.ok(optimized.score.rankingScore > baseline.rankingScore);
}

console.log("chart timeline scoring tests: OK");
