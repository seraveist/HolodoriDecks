import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { runOptimization } from "../js/optimizer-core.js";
import { evaluateDeck } from "../js/score.js";
import { optimizeRecommendationOrders } from "../js/order.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const fixture = read("../tests/fixtures/recommendation-inventories.json");
const cards = read("../data/generated/cards.json");
const preparedCards = prepareScoreCards(cards,
  new Map(read("../data/generated/characters.json").map((row) => [row.id, row])),
  Object.fromEntries(cards.map((card) => [card.id, { level: 80, potential: 0 }])),
  { levelMode: "max", masterRefs: read("../data/generated/master_refs.json") });
const common = { preparedCards, currentMembers: Array(6).fill(null),
  lockedSlots: Array(6).fill(false), playMode: "auto", separateRole: true, resultCount: 5 };
const key = (ids) => `${ids[0]}::${ids.slice(1).sort().join("|")}`;

for (const test of fixture.cases) {
  for (const simulationTarget of ["score", "potential"]) {
    const started = performance.now();
    const result = runOptimization({ ...common, ownedCardIds: test.ownedCardIds, simulationTarget });
    assert.ok(result.ok, `${test.id}/${simulationTarget}`);
    assert.equal(result.results.length, 5);
    assert.equal(new Set(result.results.map((row) => key(row.members))).size, 5,
      "Orders of the same composition must not take multiple result slots");
    for (const [index, row] of result.results.entries()) {
      assert.ok(row.members.every((id) => test.ownedCardIds.includes(id)), "Unowned card recommended");
      assert.equal(new Set(row.members.map((id) => preparedCards.get(id).characterId)).size, 6);
      assert.ok(index === 0 || row.rankingValue <= result.results[index - 1].rankingValue);
      assert.equal(row.rankingValue, simulationTarget === "score" ? row.score.unitScore : row.score.potentialUnitScore);
      // Re-evaluate all 120 orders for the actual winning composition. Search
      // bounds must not replace the user's potential-based representative rule.
      const ordered = optimizeRecommendationOrders({ ...common, simulationTarget,
        recommendation: { ok: true, results: [row] }, resultCount: 1 });
      assert.deepEqual(row.members, ordered.members);
    }
    const expected = test.targets[simulationTarget].map((row) => row.value);
    const actual = result.results.map((row) => row.rankingValue);
    if (test.exact) assert.deepEqual(actual, expected, `${test.id}: exhaustive TOP5 snapshot`);
    else actual.forEach((value, index) => assert.ok(value >= expected[index],
      `${test.id}/${simulationTarget}/TOP${index + 1}: ${value} missed known ${expected[index]}`));
    // Verify saved challenger scores still describe the current score engine.
    for (const row of test.targets[simulationTarget]) {
      const score = evaluateDeck({ leader: preparedCards.get(row.members[0]),
        members: row.members.slice(1).map((id) => preparedCards.get(id)) });
      assert.equal(simulationTarget === "score" ? score.unitScore : score.potentialUnitScore, row.value);
    }
    if (test.id === "D") assert.ok(result.evaluatedCount < 400_000,
      "26-card inventory must not regress to 1.38 million per-leader exhaustive cases");
    if (test.id === "B" && simulationTarget === "score") {
      const reversed = runOptimization({ ...common, simulationTarget,
        ownedCardIds: [...test.ownedCardIds].reverse() });
      assert.deepEqual(reversed.results.map((row) => row.members), result.results.map((row) => row.members),
        "The same collection imported in reverse order must produce the same TOP5");
    }
    console.log(`[inventories] ${test.id}/${simulationTarget}: ${actual.join(", ")} (${Math.round(performance.now() - started)} ms)`);
  }
}
