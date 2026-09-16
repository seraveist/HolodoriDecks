import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardCatalog } from '../js/board-data.js';
const read = name => JSON.parse(readFileSync(new URL('../data/generated/' + name, import.meta.url),'utf8'));
const characters = createBoardCatalog(read('boards.json'),read('memory-bonuses.json'),read('i18n/boards/ko.json'),read('manifest.json'));
const BOARD_NODES = characters.board('chr-00001').nodes.map(({id,type,x,y}) => ({id,type,x,y}));
const CONNECTOR_IDS = characters.board('chr-00001').connectors;
const cardRows = read('cards.json').filter(c => characters.canConnect(c.id));
const CARD_A = cardRows.find(c => c.character_id === 'chr-00001').id;
const CARD_A_OTHER = cardRows.find(c => c.character_id === 'chr-00001' && c.id !== CARD_A).id;
const CARD_B = cardRows.find(c => c.character_id === 'chr-00002').id;
import {
  BOARD_STORAGE_KEY, emptyBoardState, validateBoardState, validateMemoryCount,
  toggleBoardNode, assignConnector, findCardPlacement, reconcileBoardOwnership,
  decodeBoardImport, createBoardStore,
} from '../js/board-state.js';

const owned = new Set([CARD_A, CARD_B, CARD_A_OTHER]);
const A = { characterId: 'chr-00001', slotId: 'S-001' };
const B = { characterId: 'chr-00002', slotId: 'S-002' };
function unlocked() {
  let state = toggleBoardNode(emptyBoardState(characters), A.characterId, A.slotId, characters);
  return toggleBoardNode(state, B.characterId, B.slotId, characters);
}
function place(state, target, card, options) { return assignConnector(state, target, card, owned, characters, options); }
function memoryStorage(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { assert.equal(key, BOARD_STORAGE_KEY); value = next; } };
}

test('Master layout has 153 unique IDs/positions and four connectors', () => {
  assert.equal(BOARD_NODES.length, 153);
  assert.equal(new Set(BOARD_NODES.map(n => n.id)).size, 153);
  assert.equal(new Set(BOARD_NODES.map(n => `${n.x},${n.y}`)).size, 153);
  assert.deepEqual(CONNECTOR_IDS, ['S-001', 'S-002', 'S-003', 'S-004']);
  assert.deepEqual(BOARD_NODES.find(n => n.id === 'B-003'), { id: 'B-003', type: 'B', x: -2, y: -1 });
});
test('unset memory count remains distinct from explicit zero', () => {
  assert.equal(validateMemoryCount(null), null);
  assert.equal(validateMemoryCount(0), 0);
  assert.equal(validateMemoryCount(50), 50);
});
test('invalid memory counts cannot be saved', () => {
  for (const value of [-1, 1.5, NaN, Infinity, '10', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateMemoryCount(value), /INVALID_MEMORY_COUNT/);
  }
});
test('node toggle is immutable and preserves other boards', () => {
  const original = unlocked();
  const next = toggleBoardNode(original, 'chr-00001', 'B-001', characters);
  assert.equal(original.boards['chr-00001'].unlockedNodes.includes('B-001'), false);
  assert.deepEqual(next.boards['chr-00002'], original.boards['chr-00002']);
});
test('invalid board or node is rejected', () => {
  assert.throws(() => toggleBoardNode(unlocked(), 'unknown', 'B-001', characters), /INVALID_NODE/);
  assert.throws(() => toggleBoardNode(unlocked(), 'chr-00001', 'unknown', characters), /INVALID_NODE/);
});
test('placement requires an unlocked slot and an owned card', () => {
  assert.throws(() => place(emptyBoardState(characters), A, CARD_A), /SLOT_LOCKED/);
  assert.throws(() => place(unlocked(), A, 'not-owned'), /CARD_NOT_OWNED/);
  assert.throws(() => place(unlocked(), { ...A, slotId: 'B-001' }, CARD_A), /INVALID_SLOT/);
});
test('new placement records the source', () => {
  const state = place(unlocked(), A, CARD_A);
  assert.deepEqual(findCardPlacement(state, CARD_A), A);
  assert.equal(findCardPlacement(state, CARD_B), null);
});
test('selecting the same card in the current slot is idempotent', () => {
  const state = place(unlocked(), A, CARD_A);
  assert.deepEqual(place(state, A, CARD_A), state);
});
test('duplicate card across different boards is rejected without mutation', () => {
  const state = place(unlocked(), A, CARD_A);
  const before = JSON.stringify(state);
  assert.throws(() => place(state, B, CARD_A), /CARD_IN_USE/);
  assert.equal(JSON.stringify(state), before);
});
test('duplicate card within one board is also rejected', () => {
  let state = place(unlocked(), A, CARD_A);
  state = toggleBoardNode(state, 'chr-00001', 'S-003', characters);
  assert.throws(() => place(state, { characterId: 'chr-00001', slotId: 'S-003' }, CARD_A), /CARD_IN_USE/);
});
test('confirmed move releases the old slot in the same update', () => {
  const original = place(unlocked(), A, CARD_A);
  const state = place(original, B, CARD_A, { moveFrom: A, expectedTargetCard: null });
  assert.deepEqual(findCardPlacement(state, CARD_A), B);
  assert.equal(state.boards[A.characterId].connectors[A.slotId], undefined);
  assert.deepEqual(findCardPlacement(original, CARD_A), A);
});
test('move into an occupied target releases its old card, without swapping silently', () => {
  let state = place(unlocked(), A, CARD_A);
  state = place(state, B, CARD_B);
  state = place(state, B, CARD_A, { moveFrom: A, expectedTargetCard: CARD_B });
  assert.equal(findCardPlacement(state, CARD_B), null);
  assert.deepEqual(findCardPlacement(state, CARD_A), B);
});
test('stale target/source confirmations are rejected', () => {
  let state = place(unlocked(), A, CARD_A);
  state = place(state, B, CARD_B);
  assert.throws(() => place(state, B, CARD_A, { moveFrom: A, expectedTargetCard: null }), /PLACEMENT_CHANGED/);
  state = place(state, A, null);
  assert.throws(() => place(state, B, CARD_A, { moveFrom: A, expectedTargetCard: CARD_B }), /PLACEMENT_CHANGED/);
});
test('different card IDs of the same member are not incorrectly de-duplicated', () => {
  let state = place(unlocked(), A, CARD_A);
  state = place(state, B, CARD_A_OTHER);
  assert.deepEqual(findCardPlacement(state, CARD_A), A);
  assert.deepEqual(findCardPlacement(state, CARD_A_OTHER), B);
});
test('unselecting a connector removes its card but not other placements', () => {
  let state = place(unlocked(), A, CARD_A);
  state = place(state, B, CARD_B);
  state = toggleBoardNode(state, A.characterId, A.slotId, characters);
  assert.equal(findCardPlacement(state, CARD_A), null);
  assert.deepEqual(findCardPlacement(state, CARD_B), B);
});
test('ownership reconciliation preserves unlocked nodes and removes only missing cards', () => {
  let state = place(unlocked(), A, CARD_A);
  state = place(state, B, CARD_B);
  const result = reconcileBoardOwnership(state, new Set([CARD_B]));
  assert.equal(result.removed.length, 1);
  assert.equal(result.state.boards['chr-00001'].unlockedNodes.includes('S-001'), true);
  assert.deepEqual(findCardPlacement(result.state, CARD_B), B);
});
test('export/import round-trips exactly without changing owned-card settings', () => {
  const state = { ...place(unlocked(), A, CARD_A), memoryCount: 30 };
  assert.deepEqual(decodeBoardImport(JSON.stringify(state), characters, owned), state);
});
test('import rejects malformed, future, invalid-node and duplicate-card profiles', () => {
  assert.throws(() => decodeBoardImport('{', characters, owned), /INVALID_BOARD_FILE/);
  assert.throws(() => decodeBoardImport(JSON.stringify({ ...unlocked(), version: 2 }), characters, owned), /INVALID_BOARD_FILE/);
  const state = place(unlocked(), A, CARD_A);
  state.boards['chr-00002'].connectors['S-002'] = CARD_A;
  assert.throws(() => validateBoardState(state, characters), /DUPLICATE_CARD/);
  const bad = unlocked(); bad.boards['chr-00001'].unlockedNodes.push('fake');
  assert.throws(() => validateBoardState(bad, characters), /INVALID_NODE/);
});
test('import cannot create a placement for a non-owned card', () => {
  const state = place(unlocked(), A, CARD_A);
  assert.throws(() => decodeBoardImport(JSON.stringify(state), characters, new Set()), /CARD_NOT_OWNED/);
});
test('store persists real board profile separately and reloads it', () => {
  const storage = memoryStorage();
  const store = createBoardStore({ storage, catalog: characters, getOwnedCardIds: () => owned });
  store.commit(() => place(unlocked(), A, CARD_A));
  const reloaded = createBoardStore({ storage, catalog: characters, getOwnedCardIds: () => owned });
  assert.deepEqual(findCardPlacement(reloaded.getState(), CARD_A), A);
});
test('store reads latest state before writing, preserving sequential edits from another tab', () => {
  const storage = memoryStorage();
  const options = { storage, catalog: characters, getOwnedCardIds: () => owned };
  const one = createBoardStore(options), two = createBoardStore(options);
  one.commit(state => ({ ...state, memoryCount: 15 }));
  two.commit(state => toggleBoardNode(state, 'chr-00001', 'B-001', characters));
  assert.equal(two.getState().memoryCount, 15);
});
test('failed storage writes do not report success or change in-memory state', () => {
  const errors = [];
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const store = createBoardStore({ storage, catalog: characters, getOwnedCardIds: () => owned, onError: code => errors.push(code) });
  assert.throws(() => store.commit(state => ({ ...state, memoryCount: 10 })));
  assert.equal(store.getState().memoryCount, null);
  assert.equal(errors.length, 1);
});
test('malformed saved state is not overwritten by ordinary edits', () => {
  const storage = memoryStorage('{');
  const store = createBoardStore({ storage, catalog: characters, getOwnedCardIds: () => owned });
  assert.equal(store.getError(), 'STORAGE_READ_FAILED');
  assert.throws(() => store.commit(state => ({ ...state, memoryCount: 10 })));
  assert.equal(storage.getItem(), '{');
  store.commit(() => emptyBoardState(characters), { replace: true });
  assert.equal(store.getError(), null);
});
test('getState returns a defensive copy', () => {
  const store = createBoardStore({ storage: memoryStorage(), catalog: characters, getOwnedCardIds: () => owned });
  const state = store.getState(); state.memoryCount = 99;
  assert.equal(store.getState().memoryCount, null);
});
