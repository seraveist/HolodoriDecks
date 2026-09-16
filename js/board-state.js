import { BOARD_LAYOUT_ID, BOARD_NODES, CONNECTOR_IDS } from "./board-preview-layout.js?v=1.3.1";

// Intentionally separate from the production deck store. Preview selections must
// never become scoring inputs or silently migrate into a synced board profile.
export const BOARD_STORAGE_KEY = "holodori-decksim:board-ui-preview:v1";
export const BOARD_FORMAT = "holodori-board-ui-preview";
const nodeIds = new Set(BOARD_NODES.map(node => node.id));
const slotIds = new Set(CONNECTOR_IDS);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = code => { throw new Error(code); };

export function emptyBoardState() {
  return { format: BOARD_FORMAT, version: 1, layoutId: BOARD_LAYOUT_ID, memoryCount: null, boards: {} };
}

export function validateMemoryCount(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_MEMORY_COUNT");
  return value;
}

/** Strict validation avoids silently destroying unknown/future profile versions. */
export function validateBoardState(value, characterIds) {
  if (!record(value) || value.format !== BOARD_FORMAT || value.version !== 1
      || value.layoutId !== BOARD_LAYOUT_ID || !record(value.boards)) fail("INVALID_BOARD_FILE");
  const clean = emptyBoardState();
  clean.memoryCount = validateMemoryCount(value.memoryCount);
  const usedCards = new Set();
  for (const [characterId, board] of Object.entries(value.boards)) {
    if (!characterIds.has(characterId) || !record(board) || !Array.isArray(board.unlockedNodes)
        || !record(board.connectors)) fail("INVALID_BOARD_FILE");
    const unlockedNodes = [...new Set(board.unlockedNodes)];
    if (unlockedNodes.some(id => !nodeIds.has(id))) fail("INVALID_NODE");
    const connectors = {};
    for (const [slotId, cardId] of Object.entries(board.connectors)) {
      if (!slotIds.has(slotId) || !unlockedNodes.includes(slotId)) fail("INVALID_SLOT");
      if (typeof cardId !== "string" || !cardId) fail("INVALID_CARD");
      if (usedCards.has(cardId)) fail("DUPLICATE_CARD");
      usedCards.add(cardId);
      connectors[slotId] = cardId;
    }
    clean.boards[characterId] = { unlockedNodes, connectors };
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

export function samePlacement(a, b) {
  return a?.characterId === b?.characterId && a?.slotId === b?.slotId;
}

function editableBoard(next, characterId) {
  return next.boards[characterId] ??= { unlockedNodes: [], connectors: {} };
}

export function toggleBoardNode(state, characterId, nodeId, characterIds) {
  if (!characterIds.has(characterId) || !nodeIds.has(nodeId)) fail("INVALID_NODE");
  const next = structuredClone(state);
  const board = editableBoard(next, characterId);
  if (board.unlockedNodes.includes(nodeId)) {
    board.unlockedNodes = board.unlockedNodes.filter(id => id !== nodeId);
    delete board.connectors[nodeId];
  } else board.unlockedNodes.push(nodeId);
  return next;
}

/** A move needs the exact source shown to the user, not just a boolean override. */
export function assignConnector(state, target, cardId, ownedCardIds, characterIds, options = {}) {
  if (!characterIds.has(target.characterId) || !slotIds.has(target.slotId)) fail("INVALID_SLOT");
  if (!state.boards[target.characterId]?.unlockedNodes.includes(target.slotId)) fail("SLOT_LOCKED");
  if (cardId !== null && !ownedCardIds.has(cardId)) fail("CARD_NOT_OWNED");
  const currentCard = state.boards[target.characterId].connectors[target.slotId] ?? null;
  if (Object.hasOwn(options, "expectedTargetCard") && currentCard !== options.expectedTargetCard) fail("PLACEMENT_CHANGED");
  const source = cardId === null ? null : findCardPlacement(state, cardId);
  if (source && !samePlacement(source, target) && !samePlacement(source, options.moveFrom)) fail("CARD_IN_USE");
  if (options.moveFrom && !samePlacement(source, options.moveFrom)) fail("PLACEMENT_CHANGED");
  const next = structuredClone(state);
  if (source && !samePlacement(source, target)) delete next.boards[source.characterId].connectors[source.slotId];
  if (cardId === null) delete next.boards[target.characterId].connectors[target.slotId];
  else next.boards[target.characterId].connectors[target.slotId] = cardId;
  return next;
}

/** Retain node selections, but release cards removed from the owned-card store. */
export function reconcileBoardOwnership(state, ownedCardIds) {
  const next = structuredClone(state);
  const removed = [];
  for (const [characterId, board] of Object.entries(next.boards)) {
    for (const [slotId, cardId] of Object.entries(board.connectors)) {
      if (!ownedCardIds.has(cardId)) {
        removed.push({ characterId, slotId, cardId });
        delete board.connectors[slotId];
      }
    }
  }
  return { state: next, removed };
}

export function decodeBoardImport(text, characterIds, ownedCardIds) {
  if (typeof text !== "string" || text.length > 1_000_000) fail("INVALID_BOARD_FILE");
  let payload;
  try { payload = JSON.parse(text); } catch { fail("INVALID_BOARD_FILE"); }
  const state = validateBoardState(payload, characterIds);
  for (const board of Object.values(state.boards)) {
    if (Object.values(board.connectors).some(id => !ownedCardIds.has(id))) fail("CARD_NOT_OWNED");
  }
  return state;
}

export function createBoardStore({ storage, characterIds, getOwnedCardIds, onError = () => {} }) {
  let state = emptyBoardState();
  let errorCode = null;
  const listeners = new Set();
  function read() {
    const text = storage?.getItem(BOARD_STORAGE_KEY);
    return text ? validateBoardState(JSON.parse(text), characterIds) : emptyBoardState();
  }
  function publish() { listeners.forEach(listener => listener()); }
  function refresh() {
    try {
      state = reconcileBoardOwnership(read(), getOwnedCardIds()).state;
      errorCode = null;
    } catch {
      // Keep the last good in-memory state; never auto-overwrite damaged storage.
      errorCode = "STORAGE_READ_FAILED";
      onError(errorCode);
    }
    publish();
  }
  function commit(update, { replace = false } = {}) {
    try {
      // Re-read immediately before each edit so an open tab does not overwrite
      // unrelated edits from another tab. Simultaneous writes are last-writer-wins.
      const latest = replace ? state : reconcileBoardOwnership(read(), getOwnedCardIds()).state;
      const next = validateBoardState(update(structuredClone(latest)), characterIds);
      if (!storage) fail("STORAGE_WRITE_FAILED");
      storage.setItem(BOARD_STORAGE_KEY, JSON.stringify(next));
      state = next;
      errorCode = null;
      publish();
      return true;
    } catch (error) {
      const code = error instanceof SyntaxError ? "STORAGE_READ_FAILED" : error.message;
      onError(code);
      throw error;
    }
  }
  refresh();
  return {
    getState: () => structuredClone(state),
    getError: () => errorCode,
    commit, refresh,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
