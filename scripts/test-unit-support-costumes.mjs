import fs from 'node:fs';
import assert from 'node:assert/strict';
import { prepareScoreCards } from '../js/card-prepare.js';
import { evaluateDeck } from '../js/score.js';
import { UNIT_DISPLAY_MODEL, UNIT_SUPPORT_DISPLAY_MODEL } from '../js/unit-score.js';

const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const fixture = read('./fixtures/unit-support-costumes-20261008.json');
const cards = read('../data/generated/cards.json');
const characters = new Map(read('../data/generated/characters.json').map(c => [c.id,c]));
const masterRefs = read('../data/generated/master_refs.json');
let reportedFields = 0;
for (const o of fixture.cases) {
  assert.ok(o.boardInputStatus);
  const prepared = prepareScoreCards(cards, characters, Object.fromEntries(o.profiles.map(p => [p.id,p])), {masterRefs});
  const args = {leader:prepared.get(o.leaderId),members:o.memberIds.map(id => prepared.get(id)),accountBonuses:o.accountBonuses};
  const score = evaluateDeck(args);
  assert.equal(score.detail.unitBonusModel,(o.costumeSupportPct ?? 60)>0 ? UNIT_SUPPORT_DISPLAY_MODEL : UNIT_DISPLAY_MODEL);
  assert.deepEqual(score.detail.scoreBonus,o.observed,`${o.id}: outfit/active/board/passive/SP recorded display`);
  assert.ok(score.potentialUnitScore >= score.unitScore);
  reportedFields += Object.keys(o.observed).length - Number(o.passiveAbsent);
  const withoutBoards = evaluateDeck({...args,accountBonuses:null});
  assert.equal(withoutBoards.detail.scoreBonus.board,0);
  assert.equal(withoutBoards.detail.scoreBonus.active,score.detail.scoreBonus.active);
  assert.equal(withoutBoards.detail.scoreBonus.special,score.detail.scoreBonus.special);
  if(o.accountBonuses) assert.notEqual(withoutBoards.detail.scoreBonus.outfit,score.detail.scoreBonus.outfit,
    'Subtracting displayed board bonus does not remove its indirect outfit attribution');
  else assert.deepEqual(withoutBoards.detail.scoreBonus,score.detail.scoreBonus,'Fresh board-free control needs no inherited board inputs');
  const noOutfit = {...args.leader,leader:{...args.leader.leader,
    primaryEffects:{...args.leader.leader.primaryEffects,support:0},additionalEffects:{...args.leader.leader.additionalEffects,support:0}}};
  const plain = evaluateDeck({...args,leader:noOutfit});
  assert.equal(plain.detail.scoreBonus.outfit,0);
  assert.equal(plain.detail.scoreBonus.active,score.detail.scoreBonus.active);
  assert.equal(plain.detail.scoreBonus.special,score.detail.scoreBonus.special);
  for (const supportPct of [0,25,60,100]) {
    const leader = {...args.leader,leader:{...args.leader.leader,primaryEffects:{support:supportPct},additionalEffects:{}}};
    const expected = evaluateDeck({...args,leader});
    const maximum = evaluateDeck({...args,leader,evaluationTarget:'potential'});
    assert.ok(maximum.potentialUnitScore >= expected.unitScore);
    assert.equal(expected.detail.scoreBonus.active,score.detail.scoreBonus.active);
    assert.equal(expected.detail.scoreBonus.special,score.detail.scoreBonus.special);
  }
}
assert.equal(fixture.cases.length,5);
assert.equal(fixture.cases.filter(o=>o.prospective).length,2);
assert.equal(reportedFields,24,'I passive was absent; fresh pair supplies 10 additional reported fields');
console.log('support outfits: I/J/M 14 retrospective fields plus fresh board-free outfit pair 10/10; historical board inheritance caveat retained');
