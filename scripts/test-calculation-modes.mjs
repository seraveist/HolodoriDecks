import assert from "node:assert/strict";
import { calculationSettings } from "../js/calculation-mode.js";
import { createStore } from "../js/state.js";

function storageFor(value) {
  let saved = JSON.stringify(value);
  return { getItem: () => saved, setItem: (_key, next) => { saved = next; } };
}

for (const [musicId, simulationTarget, mode] of [
  ["", "score", "unit"], ["", "potential", "unit"],
  ["m0049", "score", "expected"], ["m0049", "potential", "maximum"],
]) {
  const store = createStore({ storage: storageFor({ musicId, simulationTarget }) });
  assert.equal(store.getState().calculationMode, mode, "legacy target/song migration");
  assert.equal(store.getState().musicId, musicId, "migration preserves song selection");
  assert.equal(Object.hasOwn(store.getState(), "simulationTarget"), false, "one persisted goal controls the calculation");
}

const storage = storageFor({ calculationMode: "maximum", musicId: "m0049", difficulty: "HARD", playMode: "manual" });
const store = createStore({ storage });
assert.equal(calculationSettings(store.getState()).simulationTarget, "potential");
store.setState({ calculationMode: "unit" });
assert.deepEqual(calculationSettings(store.getState()), {
  calculationMode: "unit", musicId: "", difficulty: "EXPERT", playMode: "auto", simulationTarget: "score",
}, "hidden song, difficulty and play mode cannot affect generic scoring");
const restored = createStore({ storage });
assert.equal(restored.getState().calculationMode, "unit", "reloading a unit goal with a remembered song stays generic");
assert.equal(restored.getState().musicId, "m0049");
restored.setState({ calculationMode: "expected" });
assert.deepEqual(calculationSettings(restored.getState()), {
  calculationMode: "expected", musicId: "m0049", difficulty: "HARD", playMode: "manual", simulationTarget: "score",
}, "switching back restores song conditions for expectation scoring");
restored.setState({ calculationMode: "maximum" });
assert.equal(calculationSettings(restored.getState()).simulationTarget, "potential");
restored.setState({ separateRole: false });
assert.equal(restored.getState().calculationMode, "maximum", "leader exclusion is independent of scoring goal");
restored.setState({ musicId: "" });
assert.equal(restored.getState().calculationMode, "maximum", "an empty song does not silently change the goal to generic");
console.log("calculation modes: legacy migration, persistence, goal routing and generic isolation OK");
