import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_NODES, CONNECTOR_IDS } from '../js/board-preview-layout.js';
import {
  BOARD_STORAGE_KEY, emptyBoardState, validateBoardState, validateMemoryCount,
  toggleBoardNode, assignConnector, findCardPlacement, reconcileBoardOwnership,
  decodeBoardImport, createBoardStore,
} from '../js/board-state.js';

const characters = new Set(['chr-a', 'chr-b']);
const owned = new Set(['card-a', 'card-b', 'card-a-other-costume']);
const A = { characterId: 'chr-a', slotId: 'S-001' };
const B = { characterId: 'chr-b', slotId: 'S-002' };
function unlocked() {
  let state = toggleBoardNode(emptyBoardState(), A.characterId, A.slotId, characters);
  return toggleBoardNode(state, B.characterId, B.slotId, characters);
}
function place(state, target, card, options) { return assignConnector(state, target, card, owned, characters, options); }
function memoryStorage(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { assert.equal(key, BOARD_STORAGE_KEY); value = next; } };
}

test('reference layout has 153 unique IDs/positions and four connectors', () => {
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
  const next = toggleBoardNode(original, 'chr-a', 'B-001', characters);
  assert.equal(original.boards['chr-a'].unlockedNodes.includes('B-001'), false);
  assert.deepEqual(next.boards['chr-b'], original.boards['chr-b']);
});
test('invalid board or node is rejected', () => {
  assert.throws(() => toggleBoardNode(unlocked(), 'unknown', 'B-001', characters), /INVALID_NODE/);
  assert.throws(() => toggleBoardNode(unlocked(), 'chr-a', 'unknown', characters), /INVALID_NODE/);
});
test('placement requires an unlocked slot and an owned card', () => {
  assert.throws(() => place(emptyBoardState(), A, 'card-a'), /SLOT_LOCKED/);
  assert.throws(() => place(unlocked(), A, 'not-owned'), /CARD_NOT_OWNED/);
  assert.throws(() => place(unlocked(), { ...A, slotId: 'B-001' }, 'card-a'), /INVALID_SLOT/);
});
test('new placement records the source', () => {
  const state = place(unlocked(), A, 'card-a');
  assert.deepEqual(findCardPlacement(state, 'card-a'), A);
  assert.equal(findCardPlacement(state, 'card-b'), null);
});
test('selecting the same card in the current slot is idempotent', () => {
  const state = place(unlocked(), A, 'card-a');
  assert.deepEqual(place(state, A, 'card-a'), state);
});
test('duplicate card across different boards is rejected without mutation', () => {
  const state = place(unlocked(), A, 'card-a');
  const before = JSON.stringify(state);
  assert.throws(() => place(state, B, 'card-a'), /CARD_IN_USE/);
  assert.equal(JSON.stringify(state), before);
});
test('duplicate card within one board is also rejected', () => {
  let state = place(unlocked(), A, 'card-a');
  state = toggleBoardNode(state, 'chr-a', 'S-003', characters);
  assert.throws(() => place(state, { characterId: 'chr-a', slotId: 'S-003' }, 'card-a'), /CARD_IN_USE/);
});
test('confirmed move releases the old slot in the same update', () => {
  const original = place(unlocked(), A, 'card-a');
  const state = place(original, B, 'card-a', { moveFrom: A, expectedTargetCard: null });
  assert.deepEqual(findCardPlacement(state, 'card-a'), B);
  assert.equal(state.boards[A.characterId].connectors[A.slotId], undefined);
  assert.deepEqual(findCardPlacement(original, 'card-a'), A);
});
test('move into an occupied target releases its old card, without swapping silently', () => {
  let state = place(unlocked(), A, 'card-a');
  state = place(state, B, 'card-b');
  state = place(state, B, 'card-a', { moveFrom: A, expectedTargetCard: 'card-b' });
  assert.equal(findCardPlacement(state, 'card-b'), null);
  assert.deepEqual(findCardPlacement(state, 'card-a'), B);
});
test('stale target/source confirmations are rejected', () => {
  let state = place(unlocked(), A, 'card-a');
  state = place(state, B, 'card-b');
  assert.throws(() => place(state, B, 'card-a', { moveFrom: A, expectedTargetCard: null }), /PLACEMENT_CHANGED/);
  state = place(state, A, null);
  assert.throws(() => place(state, B, 'card-a', { moveFrom: A, expectedTargetCard: 'card-b' }), /PLACEMENT_CHANGED/);
});
test('different card IDs of the same member are not incorrectly de-duplicated', () => {
  let state = place(unlocked(), A, 'card-a');
  state = place(state, B, 'card-a-other-costume');
  assert.deepEqual(findCardPlacement(state, 'card-a'), A);
  assert.deepEqual(findCardPlacement(state, 'card-a-other-costume'), B);
});
test('unselecting a connector removes its card but not other placements', () => {
  let state = place(unlocked(), A, 'card-a');
  state = place(state, B, 'card-b');
  state = toggleBoardNode(state, A.characterId, A.slotId, characters);
  assert.equal(findCardPlacement(state, 'card-a'), null);
  assert.deepEqual(findCardPlacement(state, 'card-b'), B);
});
test('ownership reconciliation preserves unlocked nodes and removes only missing cards', () => {
  let state = place(unlocked(), A, 'card-a');
  state = place(state, B, 'card-b');
  const result = reconcileBoardOwnership(state, new Set(['card-b']));
  assert.equal(result.removed.length, 1);
  assert.equal(result.state.boards['chr-a'].unlockedNodes.includes('S-001'), true);
  assert.deepEqual(findCardPlacement(result.state, 'card-b'), B);
});
test('export/import round-trips exactly without changing owned-card settings', () => {
  const state = { ...place(unlocked(), A, 'card-a'), memoryCount: 30 };
  assert.deepEqual(decodeBoardImport(JSON.stringify(state), characters, owned), state);
});
test('import rejects malformed, future, invalid-node and duplicate-card profiles', () => {
  assert.throws(() => decodeBoardImport('{', characters, owned), /INVALID_BOARD_FILE/);
  assert.throws(() => decodeBoardImport(JSON.stringify({ ...unlocked(), version: 2 }), characters, owned), /INVALID_BOARD_FILE/);
  const state = place(unlocked(), A, 'card-a');
  state.boards['chr-b'].connectors['S-002'] = 'card-a';
  assert.throws(() => validateBoardState(state, characters), /DUPLICATE_CARD/);
  const bad = unlocked(); bad.boards['chr-a'].unlockedNodes.push('fake');
  assert.throws(() => validateBoardState(bad, characters), /INVALID_NODE/);
});
test('import cannot create a placement for a non-owned card', () => {
  const state = place(unlocked(), A, 'card-a');
  assert.throws(() => decodeBoardImport(JSON.stringify(state), characters, new Set()), /CARD_NOT_OWNED/);
});
test('store persists preview separately and reloads it', () => {
  const storage = memoryStorage();
  const store = createBoardStore({ storage, characterIds: characters, getOwnedCardIds: () => owned });
  store.commit(() => place(unlocked(), A, 'card-a'));
  const reloaded = createBoardStore({ storage, characterIds: characters, getOwnedCardIds: () => owned });
  assert.deepEqual(findCardPlacement(reloaded.getState(), 'card-a'), A);
});
test('store reads latest state before writing, preserving sequential edits from another tab', () => {
  const storage = memoryStorage();
  const options = { storage, characterIds: characters, getOwnedCardIds: () => owned };
  const one = createBoardStore(options), two = createBoardStore(options);
  one.commit(state => ({ ...state, memoryCount: 15 }));
  two.commit(state => toggleBoardNode(state, 'chr-a', 'B-001', characters));
  assert.equal(two.getState().memoryCount, 15);
});
test('failed storage writes do not report success or change in-memory state', () => {
  const errors = [];
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const store = createBoardStore({ storage, characterIds: characters, getOwnedCardIds: () => owned, onError: code => errors.push(code) });
  assert.throws(() => store.commit(state => ({ ...state, memoryCount: 10 })));
  assert.equal(store.getState().memoryCount, null);
  assert.equal(errors.length, 1);
});
test('malformed saved state is not overwritten by ordinary edits', () => {
  const storage = memoryStorage('{');
  const store = createBoardStore({ storage, characterIds: characters, getOwnedCardIds: () => owned });
  assert.equal(store.getError(), 'STORAGE_READ_FAILED');
  assert.throws(() => store.commit(state => ({ ...state, memoryCount: 10 })));
  assert.equal(storage.getItem(), '{');
  store.commit(() => emptyBoardState(), { replace: true });
  assert.equal(store.getError(), null);
});
test('getState returns a defensive copy', () => {
  const store = createBoardStore({ storage: memoryStorage(), characterIds: characters, getOwnedCardIds: () => owned });
  const state = store.getState(); state.memoryCount = 99;
  assert.equal(store.getState().memoryCount, null);
});
