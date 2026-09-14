import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck } from "../js/score.js";

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), "utf8"));
const prepared = prepareScoreCards(read("cards"), new Map(read("characters").map(c => [c.id, c])), {}, { masterRefs: read("master_refs") });
const leader = prepared.get("card-06003-5-uniq-0059-00");
const members = [
  "card-00026-5-uniq-0065-00", "card-00018-5-uniq-0068-00", "card-00027-5-uniq-0022-00",
  "card-06002-5-uniq-0066-00", "card-06004-5-uniq-0060-00",
].map(id => prepared.get(id));
const music = { ...read("music").find(m => m.id === "m0049"), _scoreRules: read("live-score-rules") };
const entry = read("chart-index").charts["m0049:EXPERT"];
const variants = {
  exact: { ...music, _chart: { ...entry, metadata: read("charts/m0049-EXPERT") } },
  master: { ...music, _chart: { ...entry, metadata: null } },
  estimated: music,
};
const lowerProbability = members.map(m => ({ ...m, active: { ...m.active, probability: m.active.probability / 2 } }));
const noRate = members.map(m => ({ ...m, special: { ...m.special, activationRateUp: 0 } }));
const impossible = members.map(m => ({ ...m, active: { ...m.active, probability: 0 } }));
const noActive = impossible.map(m => ({ ...m, active: { ...m.active, baseScoreUp: 0, conditionalScoreUp: 0 } }));
const failures = [];
const check = (name, fn) => {
  try { fn(); } catch (error) { failures.push(`${name}: ${error.message}`); }
};
const generic = evaluateDeck({ leader, members });
for (const [accuracy, song] of Object.entries(variants)) {
  const evaluate = (cards = members, playMode = "auto", evaluationTarget = "both") => evaluateDeck({ leader, members: cards, music: song, playMode, evaluationTarget });
  const auto = evaluate();
  const manual = evaluate(members, "manual");
  check(`${accuracy}: manual PERFECT weights and combo survive normalization`, () => {
    assert.ok(manual.rankingScore > auto.rankingScore);
    assert.ok(manual.potentialRankingScore > auto.potentialRankingScore);
  });
  for (const playMode of ["auto", "manual"]) {
    const both = evaluate(members, playMode);
    check(`${accuracy}/${playMode}: all-success ceiling does not depend on positive activation probability`, () => {
      assert.equal(evaluate(lowerProbability, playMode).potentialRankingScore, both.potentialRankingScore);
      assert.equal(evaluate(noRate, playMode).potentialRankingScore, both.potentialRankingScore);
      assert.ok(evaluate(lowerProbability, playMode).rankingScore <= both.rankingScore);
    });
    check(`${accuracy}/${playMode}: impossible skills cannot activate even in maximum mode`, () => {
      assert.equal(evaluate(impossible, playMode).potentialRankingScore, evaluate(noActive, playMode).potentialRankingScore);
      assert.equal(evaluate(impossible, playMode).rankingScore, evaluate(impossible, playMode).potentialRankingScore);
    });
    check(`${accuracy}/${playMode}: single-goal search agrees with final two-goal results`, () => {
      assert.equal(evaluate(members, playMode, "score").rankingScore, both.rankingScore);
      assert.equal(evaluate(members, playMode, "potential").potentialRankingScore, both.potentialRankingScore);
      assert.ok(both.potentialRankingScore >= both.rankingScore);
      assert.equal(both.unitScore, generic.unitScore);
      assert.equal(both.potentialUnitScore, generic.potentialUnitScore);
    });
  }
}
assert.deepEqual(failures, [], failures.join("\n"));
console.log("song score invariants: exact/master/estimated × AUTO/manual passed");
