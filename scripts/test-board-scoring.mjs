import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBoardCatalog, connectInfo, connectRange } from '../js/board-data.js';
import { emptyBoardState } from '../js/board-state.js';
import { compileBoardProfile, resolveBoardProfile, boardStatBonuses, boostedBoardEffects } from '../js/board-score.js';
import { prepareScoreCards } from '../js/card-prepare.js';
import { evaluateDeck, prepareDeckComposition, withBoardHeuristic } from '../js/score.js';
import { runOptimization } from '../js/optimizer-core.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/generated/${name}.json`, import.meta.url), 'utf8'));
const raw = read('boards'), characters = read('characters'), cards = read('cards');
const catalog = createBoardCatalog(raw, read('memory-bonuses'), read('i18n/boards/ko'), read('manifest'));
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/unit-display-through-BJ.json', import.meta.url), 'utf8'));
const boost85 = 'card-00013-5-uniq-0002-00', boost55 = 'card-00022-5-uniq-0018-00';
const compile = (state, settings = {}, ownedCardIds = cards.map(c => c.id)) => compileBoardProfile(catalog, state,
  { characters, ownedCardIds, ownedCardSettings: settings });
const board = (id, nodes, connectors = {}) => ({ layoutId: catalog.board(id).id,
  unlockedNodes: [...new Set([...nodes, ...Object.keys(connectors)])], connectors });
const stateWith = boards => ({ ...emptyBoardState(catalog), boards });
const input = id => {
  const observation = fixture.cases.find(o => o.id === id);
  const prepared = prepareScoreCards(cards, new Map(characters.map(c => [c.id, c])),
    Object.fromEntries(observation.profiles.map(p => [p.id, p])), { masterRefs: read('master_refs') });
  return { observation, prepared, leader: prepared.get(observation.leaderId), members: observation.memberIds.map(id => prepared.get(id)) };
};
const leaderBoard = () => board('chr-06003', ['R-032', 'R-034', 'R-049'], { 'S-002': boost55 });

test('real 85%/55% Connect boosts retain precision, coverage, ownership and awakening', () => {
  const state = stateWith({ 'chr-00022': board('chr-00022', ['B-007', 'B-010', 'B-017', 'B-012'], { 'S-003': boost85 }),
    'chr-06003': leaderBoard() });
  const before = JSON.stringify([state, raw]);
  const effects = boostedBoardEffects(catalog, 'chr-00022', state.boards['chr-00022']);
  assert.equal(effects.get('B-007').value / 10, 11.1);
  assert.equal(effects.get('B-010').value / 10, 3.7);
  assert.equal(effects.get('B-017').value / 10, 3.7);
  assert.equal(effects.get('B-012').value / 10, 3);
  const profile = compile(state), result = resolveBoardProfile(profile, 'chr-06003');
  assert.equal(result.memberBoards['chr-00022'].activationRatePct, 21.5);
  assert.equal(result.leaderBoardSupportPct, 13.3);
  assert.equal(resolveBoardProfile(profile, 'chr-00022').leaderBoardSupportPct, 0);
  const noOwnedConnect = resolveBoardProfile(compile(state, {}, []), 'chr-06003');
  assert.equal(noOwnedConnect.memberBoards['chr-00022'].activationRatePct, 13);
  assert.equal(noOwnedConnect.leaderBoardSupportPct, 10);
  const awakened = resolveBoardProfile(compile(state, { [boost85]: { potential: 5 } }), 'chr-06003');
  assert.ok(awakened.memberBoards['chr-00022'].activationRatePct > 21.5);
  assert.equal(JSON.stringify([state, raw]), before, 'compilation must not mutate saved state or Master');
});

test('AO–AS measured passive/board pairs reproduce through actual selected nodes', () => {
  const frequency = catalog.board('chr-00022').nodes.find(n => n.effect?.effectType.includes('COOL_TIME_SHORTEN') && Number(n.effect.value) === 40).id;
  for (const [id, nodes] of Object.entries({
    AO: ['B-007', 'B-010', 'B-017', 'B-012', 'B-026', frequency],
    AP: ['B-007', 'B-010', 'B-017', 'B-012', 'B-026'],
    AQ: ['B-007', 'B-010', 'B-017', 'B-012'], AR: ['B-007', 'B-010', 'B-012'], AS: [],
  })) {
    const args = input(id);
    const state = stateWith({ 'chr-06003': leaderBoard(),
      'chr-00022': board('chr-00022', nodes, { 'S-003': boost85 }),
      'chr-00021': board('chr-00021', id === 'AS' ? [] : ['B-007']) });
    const score = evaluateDeck({ ...args, accountBonuses: { boardProfile: compile(state) } });
    const previous = evaluateDeck({ ...args, accountBonuses: args.observation.accountBonuses });
    assert.deepEqual(score.detail.scoreBonus, previous.detail.scoreBonus, id);
    assert.equal(score.detail.scoreBonus.passive, args.observation.observed.passive, id);
    assert.equal(score.detail.scoreBonus.board, args.observation.observed.board, id);
  }
});

test('all current selected Master effects compile; every slot/range pair is disjoint', () => {
  const state = stateWith(Object.fromEntries(Object.keys(raw.resolved).map(id => [id,
    board(id, catalog.board(id).nodes.map(n => n.id))])));
  assert.ok(compile(state).effects.length > 1000);
  for (const id of Object.keys(raw.resolved)) {
    const slots = catalog.board(id).nodes.filter(n => n.type === 'S');
    const unions = slots.map(slot => new Set(Object.values(raw.connectRanges).flat()
      .map(cell => `${slot.x + cell.x},${slot.y + cell.y}`)));
    for (let i = 0; i < unions.length; i++) for (let j = i + 1; j < unions.length; j++)
      assert.ok([...unions[i]].every(cell => !unions[j].has(cell)), `${id}: overlapping slots`);
  }
});

test('memory table, per-stat rounding, empty profile and changed profile cache', () => {
  const args = input('AS'), state = emptyBoardState(catalog), original = evaluateDeck(args);
  assert.deepEqual(evaluateDeck({ ...args, accountBonuses: { boardProfile: compile(state) } }), original);
  state.memoryCount = 31;
  const bonuses = { boardProfile: compile(state) }, withMemory = evaluateDeck({ ...args, accountBonuses: bonuses });
  const expected = args.members.flatMap(m => Object.values(m.stats)).reduce((sum, v) => sum + Math.ceil(v * .061 - 1e-8), 0);
  assert.equal(withMemory.detail.power.memory, expected);
  assert.equal(withMemory.overallPower - original.overallPower, expected);
  assert.equal(compile({ ...state, memoryCount: 50 }).memoryPct, 8);
  assert.throws(() => compile({ ...state, memoryCount: 51 }), /BOARD_MEMORY_UNKNOWN/);
  const preparedComposition = prepareDeckComposition({ ...args, accountBonuses: bonuses });
  assert.deepEqual(evaluateDeck({ ...args, preparedComposition }), original, 'changed board invalidates prepared score');
  assert.deepEqual(boardStatBonuses([{ characterId: 'a', stats: { p: 101, t: 202, s: 303 } }], {
    memoryPct: 6, memberBoards: { a: { flat: { p: 2.5 }, percent: { t: 5.5 } } },
  }), { board: { p: 3, t: 12, s: 0 }, memory: { p: 7, t: 13, s: 19 } });
});

test('roles, explicit member/group targets and song singer conditions follow Master', () => {
  const owner = 'chr-04016'; // FUWAMOCO SOLO songs have two singer IDs.
  const selected = catalog.board(owner).nodes.map(n => n.id);
  const profile = compile(stateWith({ [owner]: board(owner, selected) }));
  const generic = resolveBoardProfile(profile, owner);
  const solo = { id: 'duet-as-solo', music_singer_type: 'SOLO', character_ids: [owner, 'chr-04017'] };
  const matching = resolveBoardProfile(profile, owner, solo);
  assert.ok(matching.directScorePct > 0);
  assert.equal(generic.directScorePct, 0);
  assert.equal(resolveBoardProfile(profile, owner, { ...solo, character_ids: ['chr-00001'] }).directScorePct, 0);
  assert.ok(resolveBoardProfile(profile, owner, { music_singer_type: 'ALL', character_ids: [] }).directScorePct > 0);
  assert.ok(resolveBoardProfile(profile, 'chr-00001', solo).leaderBoardSupportPct < matching.leaderBoardSupportPct);
  const grouped = profile.effects.find(e => e.type === 'ALL_PARAMETER_UP_FOR_CHARACTER_GROUPING');
  assert.ok(grouped && grouped.targets.length > 1 && grouped.targets.length < characters.length);
  const plain = compile(stateWith({ 'chr-00022': board('chr-00022', ['B-001']) }));
  const resolved = resolveBoardProfile(plain, 'chr-06003');
  assert.deepEqual(Object.keys(resolved.memberBoards), ['chr-00022']);
  assert.deepEqual(resolved.memberBoards['chr-00022'].flat, { p: 50, t: 50, s: 50 });
});

test('board rates affect expectation, frequency affects both goals, and song paths agree', () => {
  const args = input('AP'), song = { ...read('music').find(m => m.id === 'm0049'), _scoreRules: read('live-score-rules') };
  const chart = read('chart-index').charts['m0049:EXPERT'];
  const variants = [song, { ...song, _chart: { ...chart, metadata: null } },
    { ...song, _chart: { ...chart, metadata: read('charts/m0049-EXPERT') } }];
  const rate = { memberBoards: Object.fromEntries(args.members.map(m => [m.characterId, { activationRatePct: 30 }])) };
  const frequency = { memberBoards: Object.fromEntries(args.members.map(m => [m.characterId, { activationFrequencyPct: 20 }])) };
  const before = JSON.stringify(args.members);
  for (const music of variants) for (const playMode of ['auto', 'manual']) {
    const base = evaluateDeck({ ...args, music, playMode });
    const adjusted = evaluateDeck({ ...args, music, playMode, accountBonuses: rate });
    assert.ok(adjusted.rankingScore > base.rankingScore);
    assert.equal(adjusted.potentialRankingScore, base.potentialRankingScore, 'rates cannot improve all-success maximum');
    const faster = evaluateDeck({ ...args, music, playMode, accountBonuses: frequency });
    assert.notEqual(faster.potentialRankingScore, base.potentialRankingScore);
    assert.ok(faster.potentialRankingScore >= faster.rankingScore);
    for (const evaluationTarget of ['score', 'potential']) {
      const single = evaluateDeck({ ...args, music, playMode, accountBonuses: rate, evaluationTarget });
      const key = evaluationTarget === 'score' ? 'rankingScore' : 'potentialRankingScore';
      assert.equal(single[key], adjusted[key]);
    }
    const direct = evaluateDeck({ ...args, music, playMode, accountBonuses: { directScorePct: 5 } });
    assert.ok(Math.abs(direct.songProjection.skillRatio - base.songProjection.skillRatio - .05) < 1e-10);
    assert.ok(Math.abs(direct.songProjection.maxSkillRatio - base.songProjection.maxSkillRatio - .05) < 1e-10);
  }
  const costumeLeader = { ...args.leader, leader: { ...args.leader.leader, primaryEffects: { support: 20 }, additionalEffects: {} } };
  assert.ok(evaluateDeck({ ...args, leader: costumeLeader, accountBonuses: { leaderBoardSupportPct: 13.3 } }).detail.scoreBonus.board > 0,
    'score-support costumes must not silently discard board bonuses');
  assert.equal(JSON.stringify(args.members), before);
});

const permutations = xs => xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map(tail => [x, ...tail]));
test('Worker entry, candidate selection and final 120-order search retain board effects', () => {
  const args = input('AP'), state = stateWith({ 'chr-06003': leaderBoard(), 'chr-00022': board('chr-00022', ['B-001', 'B-007', 'B-010']) });
  state.memoryCount = 31;
  const accountBonuses = structuredClone({ boardProfile: compile(state) });
  const song = { ...read('music').find(m => m.id === 'm0049'), _scoreRules: read('live-score-rules') };
  const entry = read('chart-index').charts['m0049:EXPERT'];
  const exact = { ...song, _chart: { ...entry, metadata: read('charts/m0049-EXPERT') } };
  const ids = [args.leader.id, ...args.members.map(m => m.id)];
  const alternate = 'card-00018-5-uniq-0068-00';
  const candidates = [...args.members, args.prepared.get(alternate)];
  for (const music of [null, exact]) for (const simulationTarget of ['score', 'potential']) {
    const result = runOptimization({ preparedCards: args.prepared, accountBonuses,
      ownedCardIds: [...ids, alternate], currentMembers: ids, lockedSlots: [true, false, false, false, false, false],
      searchMusic: music, exactMusic: music, simulationTarget, resultCount: 5 });
    assert.equal(result.ok, true);
    const metric = score => simulationTarget === 'score' ? score.rankingScore : score.potentialRankingScore;
    const exhaustive = candidates.map((_, excluded) => Math.max(...permutations(candidates.filter((_, i) => i !== excluded))
      .map(members => metric(evaluateDeck({ leader: args.leader, members, music, accountBonuses }))))).sort((a, b) => b - a);
    assert.deepEqual(result.results.map(r => metric(r.score)), exhaustive.slice(0, 5));
    assert.equal(new Set(result.results.map(r => r.members.slice(1).toSorted().join('|'))).size, 5);
    for (const row of result.results) {
      const fresh = evaluateDeck({ leader: args.leader, members: row.members.slice(1).map(id => args.prepared.get(id)), music, accountBonuses });
      assert.equal(metric(row.score), metric(fresh));
      assert.ok(row.score.detail.power.memory > 0);
    }
  }
  const noel = args.members.find(m => m.characterId === 'chr-00022');
  const adjusted = withBoardHeuristic(noel, args.leader, accountBonuses);
  assert.deepEqual(adjusted.stats, noel.stats);
  assert.deepEqual(adjusted.active, noel.active);
  assert.ok(adjusted._boardHeuristic.performance > noel.stats.p);
});
