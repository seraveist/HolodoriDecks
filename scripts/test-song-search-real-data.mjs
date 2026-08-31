import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";
import {
  exactShortlistSize,
  optimizeOwnedDeck,
  recommendationValue,
} from "../js/recommend.js";
import { optimizeRecommendationOrders } from "../js/order.js";
import { runOptimization } from "../js/optimizer-core.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const music = JSON.parse(fs.readFileSync(new URL("../data/generated/music.json", import.meta.url), "utf8"));
const chartIndex = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));

const cardsForSearch = cards.filter((card) => [4, 5].includes(Number(card.rarity)));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const musicById = new Map(music.map((row) => [row.id, row]));
const settings = Object.fromEntries(cardsForSearch.map((card) => {
  const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1));
  return [card.id, { level: maxLevel, potential: 0 }];
}));
const preparedCards = prepareScoreCards(cardsForSearch, charactersById, settings, {
  levelMode: "max",
  masterRefs,
});

function seededShuffle(values, seed) {
  let state = seed >>> 0;
  const result = [...values];
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function compositionKey(result) {
  return `${result.members[0]}::${result.members.slice(1).sort().join("|")}`;
}

function rankTuple(result, simulationTarget) {
  return [
    recommendationValue(result.score, simulationTarget),
    Number(result.score?.rankingScore) || 0,
    Number(result.score?.unitScore) || 0,
  ];
}

function rankTupleKey(result, simulationTarget) {
  return JSON.stringify(rankTuple(result, simulationTarget));
}

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || (Number(right.score?.rankingScore) || 0) - (Number(left.score?.rankingScore) || 0)
    || (Number(right.score?.unitScore) || 0) - (Number(left.score?.unitScore) || 0);
}

function assertTopFiveParity(actual, expected, label) {
  assert.equal(actual.ok, true, `${label}: optimized result failed`);
  assert.equal(expected.ok, true, `${label}: exact result failed`);
  const target = actual.simulationTarget;
  const actualTop = actual.results.slice(0, 5);
  const expectedTop = expected.results.slice(0, 5);
  assert.deepEqual(
    actualTop.map((row) => rankTuple(row, target)),
    expectedTop.map((row) => rankTuple(row, target)),
    `${label}: TOP5 ranking tuples differ`,
  );

  const exactKeysByTuple = new Map();
  for (const row of expected.results) {
    const tuple = rankTupleKey(row, target);
    const keys = exactKeysByTuple.get(tuple) ?? new Set();
    keys.add(compositionKey(row));
    exactKeysByTuple.set(tuple, keys);
  }
  for (let index = 0; index < actualTop.length; index += 1) {
    const tuple = rankTupleKey(actualTop[index], target);
    const allowed = exactKeysByTuple.get(tuple) ?? new Set();
    assert.ok(
      allowed.has(compositionKey(actualTop[index])),
      `${label}: optimized rank ${index + 1} is not part of the Exact tie group`,
    );
  }
}

function combinations(values, size, start = 0, selected = [], out = []) {
  if (selected.length === size) {
    out.push([...selected]);
    return out;
  }
  for (let index = start; index <= values.length - (size - selected.length); index += 1) {
    combinations(values, size, index + 1, [...selected, values[index]], out);
  }
  return out;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([value, ...tail]);
  });
  return result;
}

function masterSongContext(musicId) {
  const song = musicById.get(musicId);
  const chart = chartIndex.charts?.[`${musicId}:EXPERT`];
  assert.ok(song && chart, `missing real song/chart fixture: ${musicId}`);
  return { ...song, _chart: { ...chart, metadata: null }, _scoreRules: rules };
}

const leaderRaw = cardsForSearch.find((card) => {
  const prepared = preparedCards.get(card.id);
  return prepared?.leader?.primaryCondition?.length === 0
    && Number(card.rarity) === 4;
});
assert.ok(leaderRaw, "real-data song test requires an unconditional rarity-4 leader");
const leader = preparedCards.get(leaderRaw.id);
const eligibleRaw = cardsForSearch.filter((card) => card.id !== leader.id && card.character_id !== leader.characterId);
const shuffled = seededShuffle(eligibleRaw, 20260831);

// Large Master-only fixture: fixed leader + 27 real members gives C(27,5)=80,730,
// deliberately crossing the per-leader Exact threshold. Compare the actual app
// pipeline (Beam/Hybrid shortlist -> all 5! orders) with an Exact stage-one
// shortlist followed by the same all-order refinement.
const masterPoolRaw = shuffled.slice(0, 27);
assert.equal(masterPoolRaw.length, 27);
const masterOwned = [leader.id, ...masterPoolRaw.map((card) => card.id)];
const commonMaster = {
  preparedCards,
  ownedCardIds: masterOwned,
  currentMembers: [leader.id, null, null, null, null, null],
  lockedSlots: [true, false, false, false, false, false],
  difficulty: "EXPERT",
  playMode: "auto",
  separateRole: true,
  resultCount: 5,
};

for (const musicId of ["m0129", "m0008"]) {
  const songContext = masterSongContext(musicId);
  const shortlist = exactShortlistSize(songContext._chart.fullComboNoteCount, masterOwned.length);
  for (const simulationTarget of ["score", "potential"]) {
    const optimized = runOptimization({
      ...commonMaster,
      searchMusic: songContext,
      exactMusic: songContext,
      simulationTarget,
      hasExactOrder: false,
    });

    let exact = optimizeOwnedDeck({
      ...commonMaster,
      music: songContext,
      simulationTarget,
      resultCount: shortlist,
      exactCaseLimit: 10_000_000,
    });
    assert.equal(exact.searchMode, "exact", `${musicId}/${simulationTarget}: forced Exact did not stay Exact`);
    exact = optimizeRecommendationOrders({
      recommendation: exact,
      preparedCards,
      currentMembers: commonMaster.currentMembers,
      lockedSlots: commonMaster.lockedSlots,
      music: songContext,
      difficulty: "EXPERT",
      playMode: "auto",
      simulationTarget,
      separateRole: true,
      resultCount: 5,
    });

    assert.notEqual(optimized.searchMode, "exact", `${musicId}/${simulationTarget}: fixture did not exercise Beam/Hybrid`);
    assert.equal(optimized.orderOptimization?.chartMode, "estimated", `${musicId}/${simulationTarget}: Master order optimization did not run`);
    assertTopFiveParity(optimized, exact, `${musicId}/EXPERT/${simulationTarget}`);
    console.log(
      `[song-search] ${musicId}/EXPERT/${simulationTarget}: ${optimized.searchMode}, `
      + `stage=${optimized.evaluatedCount}, orders=${optimized.orderOptimization?.evaluatedCount ?? 0}, exactStage=${exact.evaluatedCount}`,
    );
  }
}

// Small real Master fixture: verify the complete app pipeline against the true
// global optimum across every 5-member combination and every 5! member order.
const smallSong = masterSongContext("m0008");
const smallMembers = shuffled.slice(27, 36).map((card) => preparedCards.get(card.id));
assert.equal(smallMembers.length, 9);
const smallOwned = [leader.id, ...smallMembers.map((member) => member.id)];

for (const simulationTarget of ["score", "potential"]) {
  const optimized = runOptimization({
    preparedCards,
    ownedCardIds: smallOwned,
    currentMembers: [leader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    searchMusic: smallSong,
    exactMusic: smallSong,
    difficulty: "EXPERT",
    playMode: "auto",
    simulationTarget,
    separateRole: true,
    hasExactOrder: false,
    resultCount: 5,
  });

  const exhaustive = [];
  for (const combo of combinations(smallMembers, 5)) {
    let best = null;
    for (const order of permutations(combo)) {
      const score = evaluateDeck({
        leader,
        members: order,
        music: smallSong,
        difficulty: "EXPERT",
        playMode: "auto",
        separateRole: true,
        evaluationTarget: simulationTarget,
      });
      if (!score) continue;
      const candidate = {
        members: [leader.id, ...order.map((member) => member.id)],
        score,
        rankingValue: recommendationValue(score, simulationTarget),
      };
      if (!best || compareResults(candidate, best) < 0) best = candidate;
    }
    if (best) exhaustive.push(best);
  }
  exhaustive.sort(compareResults);
  const expected = { ok: true, results: exhaustive, simulationTarget };
  assertTopFiveParity(optimized, expected, `m0008/EXPERT/global-order/${simulationTarget}`);
  console.log(
    `[song-search] m0008/EXPERT/global-order/${simulationTarget}: `
    + `shortlistOrders=${optimized.orderOptimization?.evaluatedCount ?? 0}, exhaustiveOrders=${exhaustive.length * 120}`,
  );
}

console.log("real-data Master song search regression: OK");
