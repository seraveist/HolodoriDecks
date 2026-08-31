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

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const music = JSON.parse(fs.readFileSync(new URL("../data/generated/music.json", import.meta.url), "utf8"));
const chartIndex = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const exactMetadata = JSON.parse(fs.readFileSync(new URL("../data/generated/charts/m0049-EXPERT.json", import.meta.url), "utf8"));

const selectable = cards.filter((card) => [4, 5].includes(Number(card.rarity)));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const musicById = new Map(music.map((row) => [row.id, row]));
const settings = Object.fromEntries(selectable.map((card) => {
  const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1));
  return [card.id, { level: maxLevel, potential: 0 }];
}));
const preparedCards = prepareScoreCards(selectable, charactersById, settings, {
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

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || (Number(right.score?.rankingScore) || 0) - (Number(left.score?.rankingScore) || 0)
    || (Number(right.score?.unitScore) || 0) - (Number(left.score?.unitScore) || 0)
    || compositionKey(left).localeCompare(compositionKey(right));
}

function assertTopFiveParity(actual, expected, label) {
  assert.equal(actual.ok, true, `${label}: optimized result failed`);
  assert.equal(expected.ok, true, `${label}: exact result failed`);
  const actualRows = actual.results.slice(0, 5).map((row) => ({
    key: compositionKey(row),
    value: recommendationValue(row.score, actual.simulationTarget),
  }));
  const expectedRows = expected.results.slice(0, 5).map((row) => ({
    key: compositionKey(row),
    value: recommendationValue(row.score, expected.simulationTarget),
  }));
  assert.deepEqual(actualRows.map((row) => row.key), expectedRows.map((row) => row.key),
    `${label}: TOP5 compositions differ`);
  actualRows.forEach((row, index) => {
    assert.ok(Math.abs(row.value - expectedRows[index].value) < 1e-6,
      `${label}: ranking value differs at ${index + 1}: ${row.value} != ${expectedRows[index].value}`);
  });
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

const leaderRaw = selectable.find((card) => {
  const prepared = preparedCards.get(card.id);
  return prepared?.leader?.primaryCondition?.length === 0
    && Number(card.rarity) === 4;
});
assert.ok(leaderRaw, "real-data song test requires an unconditional rarity-4 leader");
const leader = preparedCards.get(leaderRaw.id);
const eligibleRaw = selectable.filter((card) => card.id !== leader.id && card.character_id !== leader.characterId);
const shuffled = seededShuffle(eligibleRaw, 20260831);

// Master-only song contexts: fixed leader + 27 real member cards gives C(27,5)=80,730,
// which deliberately crosses the default per-leader Exact threshold of 60,000.
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
  const song = musicById.get(musicId);
  const chart = chartIndex.charts?.[`${musicId}:EXPERT`];
  assert.ok(song && chart, `missing real song/chart fixture: ${musicId}`);
  const songContext = { ...song, _chart: { ...chart, metadata: null }, _scoreRules: rules };
  for (const simulationTarget of ["score", "potential"]) {
    const optimized = optimizeOwnedDeck({ ...commonMaster, music: songContext, simulationTarget });
    const exact = optimizeOwnedDeck({
      ...commonMaster,
      music: songContext,
      simulationTarget,
      exactCaseLimit: 10_000_000,
    });
    assert.notEqual(optimized.searchMode, "exact", `${musicId}/${simulationTarget}: fixture did not exercise Beam/Hybrid`);
    assert.equal(exact.searchMode, "exact", `${musicId}/${simulationTarget}: forced Exact did not stay Exact`);
    assertTopFiveParity(optimized, exact, `${musicId}/EXPERT/${simulationTarget}`);
    console.log(`[song-search] ${musicId}/EXPERT/${simulationTarget}: ${optimized.searchMode}, evaluated=${optimized.evaluatedCount}, exact=${exact.evaluatedCount}`);
  }
}

// Local Exact song: evaluate the staged shortlist + best SP order against every
// 5-member combination and all 5! orders using the real 720-note chart.
const exactSongRaw = musicById.get("m0049");
const exactChartEntry = chartIndex.charts?.["m0049:EXPERT"];
assert.ok(exactSongRaw && exactChartEntry, "missing m0049 EXPERT fixture");
assert.equal(exactMetadata.notes?.length, Number(exactChartEntry.fullComboNoteCount), "m0049 note count drift");
assert.equal(exactMetadata.skills?.length, 5, "m0049 SP marker drift");
const exactMusic = {
  ...exactSongRaw,
  _chart: { ...exactChartEntry, metadata: exactMetadata },
  _scoreRules: rules,
};
const searchMusic = {
  ...exactSongRaw,
  _chart: { ...exactChartEntry, metadata: null },
  _scoreRules: rules,
};
const exactMembersRaw = shuffled.slice(27, 36);
assert.equal(exactMembersRaw.length, 9);
const exactMembers = exactMembersRaw.map((card) => preparedCards.get(card.id));
const exactOwned = [leader.id, ...exactMembers.map((member) => member.id)];
const shortlist = exactShortlistSize(exactMetadata.notes.length, exactOwned.length);
assert.equal(shortlist, 30, "small real-card pool should keep 30 stage-one candidates");

for (const simulationTarget of ["score", "potential"]) {
  let staged = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds: exactOwned,
    currentMembers: [leader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    music: searchMusic,
    difficulty: "EXPERT",
    playMode: "auto",
    simulationTarget,
    separateRole: true,
    resultCount: shortlist,
    exactCaseLimit: 10_000_000,
  });
  staged = optimizeRecommendationOrders({
    recommendation: staged,
    preparedCards,
    currentMembers: [leader.id, null, null, null, null, null],
    lockedSlots: [true, false, false, false, false, false],
    music: exactMusic,
    difficulty: "EXPERT",
    playMode: "auto",
    simulationTarget,
    separateRole: true,
    resultCount: 5,
  });

  const exhaustive = [];
  for (const combo of combinations(exactMembers, 5)) {
    let best = null;
    for (const order of permutations(combo)) {
      const score = evaluateDeck({
        leader,
        members: order,
        music: exactMusic,
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
  const expected = {
    ok: true,
    results: exhaustive.slice(0, 5),
    simulationTarget,
  };
  assertTopFiveParity(staged, expected, `m0049/EXPERT/exact-order/${simulationTarget}`);
  console.log(`[song-search] m0049/EXPERT/${simulationTarget}: staged ${staged.orderOptimization?.evaluatedCount ?? 0} order evaluations vs exhaustive ${exhaustive.length * 120}`);
}

console.log("real-data song-specific search regression: OK");
