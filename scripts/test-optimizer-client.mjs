import assert from "node:assert/strict";
import { runOptimizationAsync } from "../js/optimizer-client.js";

function member(id) {
  return {
    id,
    characterId: `char-${id}`,
    characterName: id,
    attribute: 1,
    groupings: new Set(),
    profile: { level: 80, currentLevel: 80, maxLevel: 80, potential: 0, levelMode: "current" },
    stats: { p: 5000, t: 4000, s: 3000 },
    enhancementPermyriad: 0,
    passive: null,
    active: {
      level: 1,
      interval: 20,
      probability: 0.8,
      duration: 8,
      baseScoreUp: 40,
      conditionalScoreUp: 40,
      condition: null,
      description: id,
    },
    special: {
      level: 1,
      duration: 0,
      support: 0,
      activationRateUp: 0,
      condition: null,
      description: id,
    },
  };
}

const leader = {
  id: "L",
  characterId: "char-L",
  characterName: "L",
  leader: {
    primaryCondition: [],
    primaryEffects: { p: 0, t: 0, s: 0, support: 0 },
    additionalCondition: [],
    additionalEffects: { p: 0, t: 0, s: 0, support: 0 },
    description: "",
  },
};
const members = ["A", "B", "C", "D", "E"].map(member);
const preparedCards = new Map([leader, ...members].map((row) => [row.id, row]));
const payload = {
  preparedCards,
  ownedCardIds: ["L", ...members.map((row) => row.id)],
  currentMembers: ["L", null, null, null, null, null],
  lockedSlots: [true, false, false, false, false, false],
  searchMusic: null,
  exactMusic: null,
  difficulty: "EXPERT",
  playMode: "manual",
  simulationTarget: "score",
  separateRole: true,
  hasExactOrder: false,
  resultCount: 1,
};

class HangingWorker {
  static instances = [];

  constructor() {
    this.listeners = new Map();
    this.terminated = false;
    HangingWorker.instances.push(this);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  postMessage(message) {
    this.message = message;
  }

  terminate() {
    this.terminated = true;
  }
}

const originalWorker = globalThis.Worker;
try {
  globalThis.Worker = HangingWorker;

  const controller = new AbortController();
  const cancelledPromise = runOptimizationAsync(payload, {
    signal: controller.signal,
    timeoutMs: 5_000,
  });
  assert.equal(HangingWorker.instances.length, 1);
  controller.abort();
  const cancelled = await cancelledPromise;
  assert.equal(cancelled.cancelled, true, "AbortSignal should cancel the pending optimizer request");
  assert.equal(HangingWorker.instances[0].terminated, true, "cancelled Worker should terminate immediately");

  HangingWorker.instances.length = 0;
  const fallback = await runOptimizationAsync(payload, { timeoutMs: 1_000 });
  assert.equal(fallback.ok, true, "Worker watchdog should fall back to synchronous optimization");
  assert.equal(HangingWorker.instances.length, 1);
  assert.equal(HangingWorker.instances[0].terminated, true, "timed-out Worker should terminate before fallback result is used");
} finally {
  if (originalWorker === undefined) delete globalThis.Worker;
  else globalThis.Worker = originalWorker;
}

console.log("optimizer client cancellation/watchdog regression: OK");
