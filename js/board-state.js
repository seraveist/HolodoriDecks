// Master-backed saved node selections, separate from the old UI preview profile.
export const BOARD_STORAGE_KEY = 'holodori-decksim:boards:v1';
export const PREVIEW_STORAGE_KEY = 'holodori-decksim:board-ui-preview:v1';
export const BOARD_FORMAT = 'holodori-board-profile';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(code); };

export function emptyBoardState(catalog) {
  return { format: BOARD_FORMAT, version: 1, masterVersion: catalog.masterVersion, memoryCount: null, boards: {} };
}
export function validateMemoryCount(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_MEMORY_COUNT');
  return value;
}
export function validateBoardState(value, catalog) {
  if (!record(value) || value.format !== BOARD_FORMAT || value.version !== 1 || !record(value.boards)
    || !/^[0-9a-f]{64}$/.test(value.masterVersion ?? '')) fail('INVALID_BOARD_FILE');
  const clean = emptyBoardState(catalog);
  clean.masterVersion = value.masterVersion;
  clean.memoryCount = validateMemoryCount(value.memoryCount);
  const usedCards = new Set();
  for (const [characterId, board] of Object.entries(value.boards)) {
    const model = catalog.board(characterId);
    if (!model || !record(board) || board.layoutId !== model.id
      || !Array.isArray(board.unlockedNodes) || !record(board.connectors)) fail('BOARD_PROFILE_REVIEW');
    const unlockedNodes = [...new Set(board.unlockedNodes)];
    if (unlockedNodes.some(id => typeof id !== 'string' || !catalog.node(characterId,id))) fail('INVALID_NODE');
    const connectors = {};
    for (const [slotId, cardId] of Object.entries(board.connectors)) {
      if (!model.connectors.includes(slotId) || !unlockedNodes.includes(slotId)) fail('INVALID_SLOT');
      if (typeof cardId !== 'string' || !catalog.canConnect(cardId)) fail('INVALID_CARD');
      if (usedCards.has(cardId)) fail('DUPLICATE_CARD');
      usedCards.add(cardId); connectors[slotId] = cardId;
    }
    clean.boards[characterId] = { layoutId: model.id, unlockedNodes, connectors };
  }
  return clean;
}
export function findCardPlacement(state, cardId) {
  for (const [characterId, board] of Object.entries(state.boards)) {
    for (const [slotId, assigned] of Object.entries(board.connectors)) {
      if (assigned === cardId) return { characterId, slotId };
    }
  }
  return null;
}
export function samePlacement(a,b) { return a?.characterId === b?.characterId && a?.slotId === b?.slotId; }
function editableBoard(next, characterId, catalog) {
  return next.boards[characterId] ??= { layoutId: catalog.board(characterId).id, unlockedNodes: [], connectors: {} };
}
export function toggleBoardNode(state, characterId, nodeId, catalog) {
  if (!catalog.node(characterId, nodeId)) fail('INVALID_NODE');
  const next = structuredClone(state), board = editableBoard(next, characterId, catalog);
  if (board.unlockedNodes.includes(nodeId)) {
    board.unlockedNodes = board.unlockedNodes.filter(id => id !== nodeId);
    delete board.connectors[nodeId];
  } else board.unlockedNodes.push(nodeId);
  return next;
}
export function assignConnector(state, target, cardId, ownedCardIds, catalog, options = {}) {
  if (!catalog.board(target.characterId)?.connectors.includes(target.slotId)) fail('INVALID_SLOT');
  if (!state.boards[target.characterId]?.unlockedNodes.includes(target.slotId)) fail('SLOT_LOCKED');
  if (cardId !== null && !ownedCardIds.has(cardId)) fail('CARD_NOT_OWNED');
  if (cardId !== null && !catalog.canConnect(cardId)) fail('INVALID_CARD');
  const currentCard = state.boards[target.characterId].connectors[target.slotId] ?? null;
  if (Object.hasOwn(options,'expectedTargetCard') && currentCard !== options.expectedTargetCard) fail('PLACEMENT_CHANGED');
  const source = cardId === null ? null : findCardPlacement(state,cardId);
  if (source && !samePlacement(source,target) && !samePlacement(source,options.moveFrom)) fail('CARD_IN_USE');
  if (options.moveFrom && !samePlacement(source,options.moveFrom)) fail('PLACEMENT_CHANGED');
  const next = structuredClone(state);
  if (source && !samePlacement(source,target)) delete next.boards[source.characterId].connectors[source.slotId];
  if (cardId === null) delete next.boards[target.characterId].connectors[target.slotId];
  else next.boards[target.characterId].connectors[target.slotId] = cardId;
  return next;
}
export function reconcileBoardOwnership(state, ownedCardIds) {
  const next = structuredClone(state), removed = [];
  for (const [characterId,board] of Object.entries(next.boards)) {
    for (const [slotId,cardId] of Object.entries(board.connectors)) {
      if (!ownedCardIds.has(cardId)) { removed.push({characterId,slotId,cardId}); delete board.connectors[slotId]; }
    }
  }
  return {state:next,removed};
}
function parse(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) fail('INVALID_BOARD_FILE');
  try { return JSON.parse(text); } catch { fail('INVALID_BOARD_FILE'); }
}
export function decodeBoardImport(text,catalog,ownedCardIds) {
  const state = validateBoardState(parse(text),catalog);
  for (const board of Object.values(state.boards)) {
    if (Object.values(board.connectors).some(id => !ownedCardIds.has(id))) fail('CARD_NOT_OWNED');
  }
  return state;
}
/** Explicit conversion only; original preview storage is never written or deleted. */
export function migrateBoardPreview(text,catalog,ownedCardIds) {
  const value = parse(text);
  if (!record(value) || value.format !== 'holodori-board-ui-preview' || value.version !== 1
    || value.layoutId !== 'tree-model-001-ui-reference-v1' || !record(value.boards)) fail('INVALID_BOARD_FILE');
  const state = emptyBoardState(catalog), issues = [], used = new Set();
  state.memoryCount = validateMemoryCount(value.memoryCount);
  for (const [characterId,board] of Object.entries(value.boards)) {
    if (!record(board) || !Array.isArray(board.unlockedNodes) || !record(board.connectors)) fail('INVALID_BOARD_FILE');
    if (!catalog.has(characterId)) { issues.push(`${characterId}: BOARD_UNAVAILABLE`); continue; }
    const model = catalog.board(characterId);
    const valid = [...new Set(board.unlockedNodes)].filter(id => catalog.node(characterId,id));
    const next = {layoutId:model.id,unlockedNodes:valid,connectors:{}};
    for (const id of board.unlockedNodes) if (!catalog.node(characterId,id)) issues.push(`${characterId}/${id}: INVALID_NODE`);
    for (const [slot,card] of Object.entries(board.connectors)) {
      if (!model.connectors.includes(slot) || !valid.includes(slot) || !ownedCardIds.has(card) || !catalog.canConnect(card) || used.has(card)) {
        issues.push(`${characterId}/${slot}/${card}: INVALID_PLACEMENT`); continue;
      }
      used.add(card); next.connectors[slot] = card;
    }
    state.boards[characterId] = next;
  }
  return { state:validateBoardState(state,catalog), issues };
}
export function createBoardStore({storage,catalog,getOwnedCardIds,onError = () => {}}) {
  let state = emptyBoardState(catalog), errorCode = null;
  const listeners = new Set();
  function read() {
    const text = storage?.getItem(BOARD_STORAGE_KEY);
    return text ? validateBoardState(JSON.parse(text),catalog) : emptyBoardState(catalog);
  }
  function publish() { listeners.forEach(listener => listener()); }
  function refresh() {
    try { state = reconcileBoardOwnership(read(),getOwnedCardIds()).state; errorCode = null; }
    catch(error) { errorCode = error.message === 'BOARD_PROFILE_REVIEW' ? error.message : 'STORAGE_READ_FAILED'; onError(errorCode); }
    publish();
  }
  function commit(update,{replace = false} = {}) {
    try {
      const latest = replace ? state : reconcileBoardOwnership(read(),getOwnedCardIds()).state;
      const next = validateBoardState(update(structuredClone(latest)),catalog);
      // Stable IDs are revalidated against this catalog; new values never overwrite
      // a corrupt, unsupported, or removed-layout profile through ordinary edits.
      next.masterVersion = catalog.masterVersion;
      if (!storage) fail('STORAGE_WRITE_FAILED');
      storage.setItem(BOARD_STORAGE_KEY,JSON.stringify(next));
      state = next; errorCode = null; publish(); return true;
    } catch(error) {
      errorCode = error instanceof SyntaxError ? 'STORAGE_READ_FAILED' : error.message;
      onError(errorCode); throw error;
    }
  }
  refresh();
  return {getState:() => structuredClone(state),getError:() => errorCode,commit,refresh,
    subscribe(listener) {listeners.add(listener);return () => listeners.delete(listener);} };
}
