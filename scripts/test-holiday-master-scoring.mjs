import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { prepareScoreCards as prepareLegacy, evaluateDeck, prepareDeckComposition } from "../js/score.js";
import { optimizeOwnedDeck } from "../js/recommend.js";
import { optimizeRecommendationOrders } from "../js/order.js";

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url)));
const ids = ["card-00028-5-uniq-0121-00", "card-04003-5-uniq-0122-00", "card-04013-5-uniq-0123-00"];
const mikoId = "card-00015-5-uniq-0120-00";
const holidayIds = [mikoId, ...ids];
const cards = read("cards").filter(card => holidayIds.includes(card.id));
if (!cards.length) {
  console.log("Holiday scoring regression: master snapshot precedes the holiday cards");
  process.exit(0);
}
assert.equal(cards.length, holidayIds.length, "partial holiday scoring cohort");
const characters = new Map(read("characters").map(c => [c.id, c]));
const masterRefs = read("master_refs");
const leader = {
  id: "leader", characterId: "leader",
  leader: { primaryCondition: [], additionalCondition: [], primaryEffects: {}, additionalEffects: {} },
};
const member = (id, attribute, power) => ({
  id, characterId: id, characterName: id, attribute, groupings: new Set(),
  profile: { level: 1, maxLevel: 1, potential: 0 }, rarity: 5,
  stats: { p: power, t: power, s: power },
  active: { interval: 10, duration: 2, probability: 0.5, baseScoreUp: power === 3000 ? 5 : 75, conditionalScoreUp: power === 3000 ? 5 : 75, condition: null },
  special: { support: 0, duration: 0, activationRateUp: 0, condition: null },
  passive: null,
});
const master = {
  id: "holiday-fixture", title: "Holiday fixture", playing_seconds: 60, live_score_coefficient_permil: 5,
  _chart: { fullComboNoteCount: 8 },
};
const exact = {
  ...master, _chart: { fullComboNoteCount: 8, metadata: {
    notes: [["tap", 5], ["tap", 10], ["tap", 15], ["tap", 20], ["tap", 30], ["tap", 40], ["tap", 50], ["tap", 60]],
    skills: Array.from({ length: 5 }, (_, i) => ({ slot: i + 1, time: 10 + 10 * i, combo: i + 1 })),
    fever: { start: 30, end: 40 },
  } },
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const permutations = rows => rows.length <= 1 ? [rows] : rows.flatMap((row, index) =>
  permutations(rows.filter((_, i) => i !== index)).map(tail => [row, ...tail]));
const metadata = [[60, 120, 70, 145, 12], [70, 145, 85, 175, 10], [55, 110, 65, 135, 13]];
for (const potential of [0, 5]) {
  const profiles = Object.fromEntries(holidayIds.map(id => [id, { level: 40, potential }]));
  const prepared = prepareScoreCards(cards, characters, profiles, { masterRefs });
  const legacy = prepareLegacy(cards, characters, profiles);
  const luna = prepared.get(ids[0]);
  for (const id of [mikoId, luna.id]) {
    const card = prepared.get(id);
    assert.deepEqual(card.active.activationCondition, { kind: "attribute", value: 1, count: 2 });
    assert.deepEqual(card.active, legacy.get(id).active);
    const fillers = [member("a", 2, 2000), member("b", 2, 1000), member("c", 2, 3000), member("d", 2, 500)];
    const cuteLeader = { ...leader, attribute: 1 };
    const accountBonuses = { memberBoards: { [card.characterId]: { activationRatePct: 30, activationFrequencyPct: 10 } } };
    for (const music of [null, master, exact]) {
      const evaluate = (candidate, rest) => evaluateDeck({
        leader: cuteLeader, members: [candidate, ...rest], music, accountBonuses, includeDiagnostics: true,
      });
      const blocked = evaluate(card, fillers);
      const silent = evaluate({ ...card, active: { ...card.active, probability: 0 } }, fillers);
      assert.equal(blocked.rankingScore, silent.rankingScore);
      assert.equal(blocked.potentialRankingScore, silent.potentialRankingScore);
      assert.equal(blocked.diagnostics[0].activeAvailable, false);
      assert.equal(blocked.diagnostics[0].checks, 0);
      assert.equal(blocked.diagnostics[0].coverage, 0);
      const allowed = evaluate(card, [{ ...fillers[0], attribute: 1 }, ...fillers.slice(1)]);
      assert.equal(allowed.diagnostics[0].activeAvailable, true);
      assert.ok(allowed.diagnostics[0].checks > 0);
      assert.ok(allowed.rankingScore > blocked.rankingScore);
    }
  }
  const rate = potential ? 19 : 14;
  const sense = potential ? 17 : 13;
  assert.equal(luna.passive.effect.kind, "activationRate");
  assert.equal(luna.passive.effect.value, rate);
  assert.deepEqual(luna.passive.additionalEffect, { kind: "stat", stat: "s", value: sense, target: { kind: "attribute", value: 1, count: 2 } });
  assert.deepEqual(luna.passive, legacy.get(ids[0]).passive);
  const lowest = { ...luna, stats: { p: 100, t: 100, s: 100 } };
  const members = [lowest, member("a", 1, 2000), member("b", 1, 1000), member("noncute", 2, 3000), member("other", 3, 500)];
  const composition = prepareDeckComposition({ leader, members });
  assert.deepEqual(composition.passive.activationRateByMember, { a: rate, b: rate });
  assert.deepEqual(composition.passive.bonusStats, { p: 0, t: 0, s: Math.ceil(2000 * sense / 100) + Math.ceil(1000 * sense / 100) });
  assert.ok(composition.scoreBonusDetail.passive > 0);
  assert.equal(composition.scoreBonusDetail.board, 0, "passive rate is not attributed to board");
  const below = members.map(m => m.id === "b" ? { ...m, attribute: 2 } : m);
  assert.deepEqual(prepareDeckComposition({ leader, members: below }).passive.activationRateByMember, {});
  for (const music of [master, exact]) {
    const { songProjection } = evaluateDeck({ leader, members, music });
    for (const [id, probability] of [["a", 0.5 * (1 + rate / 100)], ["b", 0.5 * (1 + rate / 100)], ["noncute", 0.5]]) {
      near(songProjection.expected.details.find(detail => detail.cardId === id).effectiveProbability, probability);
    }
    assert.ok(songProjection.averageScore > evaluateDeck({ leader, members: below, music }).songProjection.averageScore);
  }
  for (const [i, id] of ids.entries()) {
    const card = prepared.get(id);
    assert.deepEqual(card.special, legacy.get(id).special);
    const values = metadata[i];
    const [baseValue, conditionValue] = values.slice(potential ? 2 : 0, potential ? 4 : 2);
    assert.equal(card.special.support, baseValue);
    assert.equal(card.special.conditionalSupport, conditionValue);
    assert.equal(card.special.duration, values.at(-1));

    const attribute = i === 2 ? 2 : 1;
    const matched = { ...card, attribute, passive: null };
    const group = [matched, member("a", attribute, 2000), member("b", attribute, 1000), member("c", 3, 3000), member("d", 3, 500)];
    for (const passes of [false, true]) {
      // Full-life AUTO/PERFECT model is 1000; 1001 tests the other side without
      // introducing a dynamic life simulation that the application does not have.
      const candidates = passes ? group : i === 0
        ? [{ ...matched, special: { ...matched.special, condition: { kind: "life", threshold: 1001 } } }, ...group.slice(1)]
        : group.map(m => m.id === "b" ? { ...m, attribute: 3 } : m);
      const expected = passes ? conditionValue : baseValue;
      const unit = evaluateDeck({ leader, members: candidates });
      const fallback = evaluateDeck({ leader, members: candidates, music: master });
      const timeline = evaluateDeck({ leader, members: candidates, music: exact });
      near(fallback.songProjection.expected.special.supportAveragePct, expected * card.special.duration / 60);
      assert.equal(timeline.songProjection.specialWindows[0].support, expected);
      const control = [{ ...candidates[0], special: { ...candidates[0].special, support: expected, conditionalSupport: 0 } }, ...candidates.slice(1)];
      assert.equal(unit.unitScore, evaluateDeck({ leader, members: control }).unitScore);
      assert.equal(timeline.songProjection.averageScore, evaluateDeck({ leader, members: control, music: exact }).songProjection.averageScore);
    }
  }
  // User-facing recommendation pipeline must rank with the same effective
  // mechanics when all six cards are available, not just direct projection.
  const all = [leader, ...members];
  const suggested = optimizeOwnedDeck({
    preparedCards: new Map(all.map(c => [c.id, c])), ownedCardIds: all.map(c => c.id),
    currentMembers: [leader.id, ...members.map(c => c.id)], lockedSlots: [true, false, false, false, false, false],
    music: exact, resultCount: 1,
  });
  assert.ok(suggested.ok);
  assert.equal(suggested.results.length, 1);
  const best = Math.max(...permutations(members).map(order => evaluateDeck({ leader, members: order, music: exact }).rankingScore));
  const ordered = optimizeRecommendationOrders({ recommendation: suggested, preparedCards: new Map(all.map(c => [c.id, c])), music: exact, resultCount: 1 });
  assert.equal(ordered.score.rankingScore, best, "recommendation must reproduce exact exhaustive order score");
}
console.log("Holiday master scoring: real card preparation, both levels, deck thresholds and targets, unit, fallback, exact and recommendation");
