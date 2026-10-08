import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareScoreCards } from "../js/card-prepare.js";
import { evaluateDeck, prepareDeckComposition } from "../js/score.js";

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), "utf8"));
const profiles = [
  ["card-06003-5-uniq-0059-00", 40, 0],
  ["card-00026-5-uniq-0065-00", 70, 1],
  ["card-00022-5-uniq-0063-00", 80, 1],
  ["card-06004-5-uniq-0060-00", 70, 1],
  ["card-06002-5-uniq-0058-00", 80, 0],
  ["card-00021-5-uniq-0064-00", 80, 1],
];
const prepared = prepareScoreCards(read("cards"), new Map(read("characters").map(c => [c.id, c])),
  Object.fromEntries(profiles.map(([id, level, potential]) => [id, { level, potential }])),
  { masterRefs: read("master_refs"), levelMode: "current" });
const leader = prepared.get(profiles[0][0]);
const members = profiles.slice(1).map(([id]) => prepared.get(id));
const original = evaluateDeck({ leader, members });
const swapped = evaluateDeck({ leader, members: [members[0], members[1], members[4], members[3], members[2]] });
// Observations A/B (2026-09-08): swapping Raden and Flare changes none of the
// game's displayed Unit Score components. Absolute skill bonuses remain under
// investigation; this regression verifies the observed order invariance only.
assert.equal(swapped.unitScore, original.unitScore, "Raden/Flare swap must not change this unit's score");
assert.deepEqual(swapped.detail.scoreBonus, original.detail.scoreBonus);
assert.equal(original.overallPower, 181490, "Account bonuses are excluded from this observation");
function permutations(xs) {
  return xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(tail => [x, ...tail]));
}
for (const order of permutations(members)) {
  const score = evaluateDeck({ leader, members: order });
  assert.equal(score.unitScore, original.unitScore);
  assert.equal(score.potentialUnitScore, original.potentialUnitScore);
  assert.deepEqual(score.detail.scoreBonus, original.detail.scoreBonus);
}

// Observation C: the swimsuit Kanade is confirmed Lv.40 / awakening 0.
// Her +32% Performance passive targets Flare and Watame by base total, rather
// than Flare and Raden by Performance. The observed passive power is 8172.
const cProfiles = Object.fromEntries(profiles.map(([id, level, potential]) => [id, { level, potential }]));
cProfiles["card-06002-5-uniq-0066-00"] = { level: 40, potential: 0 };
cProfiles["card-00018-5-uniq-0068-00"] = { level: 60, potential: 0 };
cProfiles["card-00027-5-uniq-0022-00"] = { level: 70, potential: 0 };
cProfiles["card-00010-5-uniq-0010-00"] = { level: 40, potential: 0 };
const cPrepared = prepareScoreCards(read("cards"), new Map(read("characters").map(c => [c.id, c])), cProfiles,
  { masterRefs: read("master_refs"), levelMode: "current" });
const cMembers = [profiles[1][0], profiles[2][0], profiles[5][0], "card-06002-5-uniq-0066-00", profiles[3][0]]
  .map(id => cPrepared.get(id));
const observedC = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: cMembers });
assert.equal(observedC.detail.power.memberParameter, 102618);
assert.equal(observedC.detail.power.outfit, 51313);
assert.equal(observedC.detail.power.passive, 8172, "Single-stat passives also select by base total");
assert.equal(observedC.overallPower, 162103);

// Observation D independently confirms the power rules after replacing Noel
// with Suisei Lv.60 / awakening 0. Skill-bonus calibration is still incomplete.
const dMembers = [...cMembers];
dMembers[1] = cPrepared.get("card-00018-5-uniq-0068-00");
const observedD = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: dMembers });
assert.equal(observedD.detail.power.memberParameter, 97578);
assert.equal(observedD.detail.power.outfit, 48793);
assert.equal(observedD.detail.power.passive, 8172);
assert.equal(observedD.overallPower, 154543);

// Observation E adds Towa's conditional Gen 4 Sense buff alongside Raden's
// ReGLOSS Sense buff and Kanade's Happy Performance buff.
const eMembers = [...dMembers];
eMembers[2] = cPrepared.get("card-00027-5-uniq-0022-00");
const observedE = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: eMembers });
assert.equal(observedE.detail.power.memberParameter, 95098);
assert.equal(observedE.detail.power.outfit, 47554);
assert.equal(observedE.detail.power.passive, 13978);
assert.equal(observedE.overallPower, 156630);

// Observation F responds to the E -> F swap request (Watame / swimsuit Kanade).
// Unlike A/B, these SPs differ in support x duration and activation-rate effect.
// Every displayed game component stayed unchanged. This checks invariance;
// it does not assert that the engine's absolute skill bonuses are calibrated.
const fMembers = [eMembers[3], eMembers[1], eMembers[2], eMembers[0], eMembers[4]];
const observedF = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: fMembers });
assert.equal(observedF.overallPower, observedE.overallPower);
assert.equal(observedF.unitScore, observedE.unitScore);
assert.equal(observedF.potentialUnitScore, observedE.potentialUnitScore);
assert.deepEqual(observedF.detail.power, observedE.detail.power);
assert.deepEqual(observedF.detail.scoreBonus, observedE.detail.scoreBonus);

// Observation G replaces E's Watame with Noel. Noel/Suisei support passives
// and Towa's stat passive are now inactive; Kanade/Raden stat passives remain.
// The game omits the score-passive category, and visible categories sum to
// its total. Active/SP absolute bonuses remain outside this regression.
const gMembers = [...eMembers];
gMembers[0] = cPrepared.get("card-00022-5-uniq-0063-00");
const observedG = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: gMembers });
assert.equal(observedG.detail.power.memberParameter, 97617);
assert.equal(observedG.detail.power.outfit, 48813);
assert.equal(observedG.detail.power.passive, 7980);
assert.equal(observedG.overallPower, 154410);
assert.equal(observedG.detail.scoreBonus.passive, 0);
assert.deepEqual(observedG.passiveStates.map(row => row.active), [false, false, false, true, true]);
const gComposition = prepareDeckComposition({ leader: cPrepared.get(profiles[0][0]), members: gMembers });
assert.deepEqual(gComposition.passive.supportByMember, Object.fromEntries(gMembers.map(m => [m.id, 0])));

// Observation I changes only G's leader to Ayame (support +60%, no relevant
// leader board effects). The game shows outfit separately and retains G's
// Active/SP. This test omits member boards; the reconstructed-board39.0%
// display is covered separately by test-unit-support-costumes.mjs.
const observedI = evaluateDeck({ leader: cPrepared.get("card-00010-5-uniq-0010-00"), members: gMembers });
assert.equal(observedI.detail.power.memberParameter, 97617);
assert.equal(observedI.detail.power.outfit, 0);
assert.equal(observedI.detail.power.passive, 7980);
assert.equal(observedI.overallPower, 105597);
for (const category of ["active", "passive", "special"]) {
  assert.equal(observedI.detail.scoreBonus[category], observedG.detail.scoreBonus[category]);
}
assert.ok(observedI.detail.scoreBonus.outfit > 0);
// Board-free normalized support: ceil(70.0070795*1.6)-70.1=42.0.
// The derived total is not an observed game Unit Score.
assert.equal(observedI.detail.scoreBonus.outfit, 42);
assert.equal(observedI.scoreBonusPct, 150.8);
assert.equal(observedI.unitScore, 539564);

// Observation J keeps E's members under Ayame. Power, Active and SP remain
// consistent with the requested experiment, but the game's Passive is 2.7%,
// not E's 2.3%. Do not encode Passive invariance or pretend it is calibrated.
const observedJ = evaluateDeck({ leader: cPrepared.get("card-00010-5-uniq-0010-00"), members: eMembers });
assert.equal(observedJ.detail.power.memberParameter, 95098);
assert.equal(observedJ.detail.power.outfit, 0);
assert.equal(observedJ.detail.power.passive, 13978);
assert.equal(observedJ.overallPower, 109076);
for (const category of ["active", "special"]) {
  assert.equal(observedJ.detail.scoreBonus[category], observedE.detail.scoreBonus[category]);
}
// Board-free three-source attribution. With the recorded member boards,
// the separate support-costume regression reproduces2.7% passive instead.
assert.equal(observedJ.detail.scoreBonus.outfit, 40.2);
assert.equal(observedJ.detail.scoreBonus.passive, 2.6);
assert.equal(observedJ.scoreBonusPct, 147.8);
assert.equal(observedJ.unitScore, 550674);

// K explicitly confirms E's composition and every displayed field after
// restoring Ririka. Reevaluate after J so leader-specific intermediate state
// cannot leak into the restored composition. Absolute bonus gaps remain open.
const observedK = evaluateDeck({ leader: cPrepared.get(profiles[0][0]), members: eMembers });
assert.deepEqual(observedK, observedE, "E -> J -> K must restore E's complete engine result");

const emptyLeader = { id: "L", characterId: "L", leader: { primaryCondition: [], additionalCondition: [], primaryEffects: {}, additionalEffects: {} } };
const support = { condition: null, effect: { kind: "support", value: 10, target: { kind: "attribute", value: 1, count: 1 } } };
const make = (id, power, attribute = 1, passive = null) => ({
  id, characterId: id, attribute, stats: { p: power, t: 0, s: 0 }, groupings: new Set(), passive,
  active: { interval: 30, duration: 0, probability: 0, baseScoreUp: 0 },
  special: { duration: 0, support: 0, activationRateUp: 0 },
});
const low = make("low", 100, 1, support);
const high = make("high", 200);
const wrongType = make("wrong-type", 1000, 2);
const filler = [make("f1", 1, 2), make("f2", 1, 2)];
const targetMap = ms => prepareDeckComposition({ leader: emptyLeader, members: ms }).passive.supportByMember;
assert.equal(targetMap([low, wrongType, high, ...filler]).high, 10, "Filter eligible members before selecting highest base total");
assert.equal(targetMap([low, wrongType, high, ...filler]).low, 0);
const tied = make("tied", 200);
assert.equal(targetMap([low, high, tied, ...filler]).high, 10, "Equal base totals retain formation order");
assert.equal(targetMap([low, tied, high, ...filler]).tied, 10);
console.log("passive target priority: A-G/I/J/K power, leader return, E/F swap, permutations and ties OK");
