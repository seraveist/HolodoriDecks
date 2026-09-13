import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";
import { unitScoreOrders } from "../js/search-order-bounds.js";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), "utf8"));
const cards = read("cards").filter((card) => card.rarity === 5);
const prepared = prepareScoreCards(cards, new Map(read("characters").map((c) => [c.id, c])),
  Object.fromEntries(cards.map((c) => [c.id, { level: 80, potential: 0 }])),
  { levelMode: "max", masterRefs: read("master_refs") });
const permutations = (values) => values.length < 2 ? [values]
  : values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map((tail) => [value, ...tail]));
let state = 20260913;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
const cases = [];
for (let index = 0; index < 100; index += 1) {
  const selected = [];
  const pool = [...prepared.values()];
  while (selected.length < 6) {
    const [card] = pool.splice(Math.floor(random() * pool.length), 1);
    if (!selected.some((c) => c.characterId === card.characterId)) selected.push(card);
  }
  cases.push(selected);
}
const fixture = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/recommendation-inventories.json", import.meta.url), "utf8"));
for (const test of fixture.cases) {
  for (const rows of Object.values(test.targets)) {
    for (const row of rows) cases.push(row.members.map((id) => prepared.get(id)));
  }
}
let reduced = 0;
let variable = 0;
for (const [leader, ...members] of cases) {
  const before = members.map((m) => m.id);
  const fullOrders = permutations(members);
  const boundedOrders = unitScoreOrders(members);
  assert.deepEqual(members.map((m) => m.id), before, "Search must not reorder its inputs");
  reduced += fullOrders.length - boundedOrders.length;
  const scores = (orders) => orders.map((order) => evaluateDeck({ leader, members: order }));
  const full = scores(fullOrders);
  const bounded = scores(boundedOrders);
  for (const field of ["unitScore", "potentialUnitScore"]) {
    const actualRange = [Math.min(...full.map((s) => s[field])), Math.max(...full.map((s) => s[field]))];
    const searchRange = [Math.min(...bounded.map((s) => s[field])), Math.max(...bounded.map((s) => s[field]))];
    assert.deepEqual(searchRange, actualRange, `${leader.id}: ${field} range excludes a real order`);
    if (actualRange[0] !== actualRange[1]) variable += 1;
  }
}
assert.ok(reduced > 0, "Order compression must actually reduce search work");
assert.ok(variable > 0, "Fixtures must exercise order-dependent passive targeting");
console.log(`[order bounds] ${cases.length} decks matched exhaustive 120-order minima and maxima for both goals`);
