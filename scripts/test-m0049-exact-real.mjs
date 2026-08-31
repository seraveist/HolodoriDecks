import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";
import { exactShortlistSize, optimizeOwnedDeck, recommendationValue } from "../js/recommend.js";
import { optimizeRecommendationOrders } from "../js/order.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const music = JSON.parse(fs.readFileSync(new URL("../data/generated/music.json", import.meta.url), "utf8"));
const chartIndex = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
const rules = JSON.parse(fs.readFileSync(new URL("../data/generated/live-score-rules.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const metadata = JSON.parse(fs.readFileSync(new URL("../data/generated/charts/m0049-EXPERT.json", import.meta.url), "utf8"));
const selectable = cards.filter((card) => [4, 5].includes(Number(card.rarity)));
const charactersById = new Map(characters.map((row) => [row.id, row]));
const settings = Object.fromEntries(selectable.map((card) => [card.id, {
  level: Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1)),
  potential: 0,
}]));
const prepared = prepareScoreCards(selectable, charactersById, settings, { levelMode: "max", masterRefs });

function seededShuffle(values, seed) {
  let state = seed >>> 0;
  const rows = [...values];
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
  }
  return rows;
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
  const out = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([value, ...tail]);
  });
  return out;
}

function compositionKey(row) {
  return `${row.members[0]}::${row.members.slice(1).sort().join("|")}`;
}

function compareResults(left, right) {
  return right.rankingValue - left.rankingValue
    || (Number(right.score?.rankingScore) || 0) - (Number(left.score?.rankingScore) || 0)
    || (Number(right.score?.unitScore) || 0) - (Number(left.score?.unitScore) || 0);
}

const leaderRaw = selectable.find((card) => Number(card.rarity) === 4 && prepared.get(card.id)?.leader?.primaryCondition?.length === 0);
assert.ok(leaderRaw);
const leader = prepared.get(leaderRaw.id);
const eligible = seededShuffle(
  selectable.filter((card) => card.id !== leader.id && card.character_id !== leader.characterId),
  20260831,
);
const memberRows = eligible.slice(27, 36).map((card) => prepared.get(card.id));
assert.equal(memberRows.length, 9);

const song = music.find((row) => row.id === "m0049");
const chart = chartIndex.charts?.["m0049:EXPERT"];
assert.ok(song && chart);
assert.equal(metadata.notes?.length, Number(chart.fullComboNoteCount));
assert.equal(metadata.skills?.length, 5);
const exactMusic = { ...song, _chart: { ...chart, metadata }, _scoreRules: rules };
const searchMusic = { ...song, _chart: { ...chart, metadata: null }, _scoreRules: rules };
const owned = [leader.id, ...memberRows.map((row) => row.id)];
const shortlist = exactShortlistSize(metadata.notes.length, owned.length);
assert.equal(shortlist, 30);

for (const simulationTarget of ["score", "potential"]) {
  let staged = optimizeOwnedDeck({
    preparedCards: prepared,
    ownedCardIds: owned,
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
    preparedCards: prepared,
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
  for (const combo of combinations(memberRows, 5)) {
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
      const row = {
        members: [leader.id, ...order.map((member) => member.id)],
        score,
        rankingValue: recommendationValue(score, simulationTarget),
      };
      if (!best || compareResults(row, best) < 0) best = row;
    }
    if (best) exhaustive.push(best);
  }
  exhaustive.sort(compareResults);

  const stagedTop = staged.results.slice(0, 5).map((row) => [recommendationValue(row.score, simulationTarget), compositionKey(row)]);
  const exactTop = exhaustive.slice(0, 5).map((row) => [recommendationValue(row.score, simulationTarget), compositionKey(row)]);
  assert.deepEqual(stagedTop, exactTop, `m0049/${simulationTarget}: staged shortlist missed exact TOP5`);
  console.log(`[m0049-exact] ${simulationTarget}: TOP5 parity; stagedOrders=${staged.orderOptimization?.evaluatedCount ?? 0}; exhaustiveOrders=${exhaustive.length * 120}`);
}

console.log("m0049 real Exact chart regression: OK");
