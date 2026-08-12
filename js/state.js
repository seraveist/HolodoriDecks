export const STORAGE_KEY = "holodori-decksim:v2";

export const INITIAL_STATE = Object.freeze({
  simulationTarget: "score",
  levelMode: "current",
  separateRole: true,
  members: [null, null, null, null, null, null],
  lockedSlots: [false, false, false, false, false, false],
  ownedCardIds: [],
  ownedCardSettings: {},
  musicId: "",
  difficulty: "EXPERT",
  playMode: "auto",
});

function readSavedState(storage) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    console.warn("저장된 보유 카드 정보를 읽지 못했습니다.", error);
    return {};
  }
}

function normalizedState(candidate, validCardIds, maxLevelsById) {
  const cleanCandidate = { ...candidate };
  delete cleanCandidate.resultZoom;
  delete cleanCandidate.targetMode;
  delete cleanCandidate.resultCount;
  const validIds = validCardIds instanceof Set ? validCardIds : new Set(validCardIds);
  const shouldValidateCards = validIds.size > 0;
  const ownedCardIds = [...new Set(Array.isArray(candidate.ownedCardIds) ? candidate.ownedCardIds : [])]
    .filter((id) => typeof id === "string" && (!shouldValidateCards || validIds.has(id)));
  const ownedSet = new Set(ownedCardIds);
  const savedSettings = candidate.ownedCardSettings && typeof candidate.ownedCardSettings === "object"
    ? candidate.ownedCardSettings
    : {};
  const ownedCardSettings = Object.fromEntries(ownedCardIds.map((cardId) => {
    const maxLevel = Math.max(1, Number(maxLevelsById?.get(cardId)) || 80);
    const saved = savedSettings[cardId] ?? {};
    const level = Math.min(maxLevel, Math.max(1, Number(saved.level) || maxLevel));
    const potential = Math.min(5, Math.max(0, Math.round(Number(saved.potential) || 0)));
    return [cardId, { level, potential }];
  }));
  const usedIds = new Set();
  const suppliedMembers = Array.isArray(candidate.members) ? candidate.members.slice(0, 6) : [];
  const suppliedLocks = Array.isArray(candidate.lockedSlots)
    ? candidate.lockedSlots.slice(0, 6)
    : suppliedMembers.map(Boolean);
  const members = Array.from({ length: 6 }, (_, index) => {
    const cardId = suppliedMembers[index];
    if (!suppliedLocks[index] || typeof cardId !== "string" || !ownedSet.has(cardId) || usedIds.has(cardId)) return null;
    usedIds.add(cardId);
    return cardId;
  });
  const lockedSlots = members.map((cardId, index) => Boolean(cardId && suppliedLocks[index]));

  return {
    ...INITIAL_STATE,
    ...cleanCandidate,
    members,
    lockedSlots,
    ownedCardIds,
    ownedCardSettings,
    simulationTarget: ["score", "potential"].includes(candidate.simulationTarget)
      ? candidate.simulationTarget
      : INITIAL_STATE.simulationTarget,
    levelMode: ["current", "max"].includes(candidate.levelMode) ? candidate.levelMode : INITIAL_STATE.levelMode,
    separateRole: candidate.separateRole !== false,
    playMode: ["auto", "manual"].includes(candidate.playMode) ? candidate.playMode : INITIAL_STATE.playMode,
  };
}

export function createStore({
  initialState = INITIAL_STATE,
  validCardIds = [],
  maxLevelsById = new Map(),
  storage = globalThis.localStorage ?? null,
} = {}) {
  let state = normalizedState({
    ...initialState,
    ...readSavedState(storage),
  }, validCardIds, maxLevelsById);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("보유 카드 정보를 저장하지 못했습니다.", error);
    }
  }

  function setState(update) {
    const patch = typeof update === "function" ? update(state) : update;
    state = normalizedState({ ...state, ...patch }, validCardIds, maxLevelsById);
    persist();
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}
