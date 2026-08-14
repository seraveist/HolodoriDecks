import assert from "node:assert/strict";
import { createOptimizationSession } from "../js/optimization-session.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const session = createOptimizationSession();
const commits = [];

async function run(signature, gate) {
  const request = session.begin(signature);
  await gate.promise;
  if (!session.finish(request)) return false;
  commits.push(signature);
  return true;
}

const aGate = deferred();
const a = run("A", aGate);
assert.equal(session.active?.signature, "A");

assert.equal(session.invalidateIfChanged("B"), true, "settings change should invalidate A");
assert.equal(session.active, null);

const bGate = deferred();
const b = run("B", bGate);
assert.equal(session.active?.signature, "B");

bGate.resolve();
assert.equal(await b, true, "B should be allowed to finalize");
assert.deepEqual(commits, ["B"]);

// A completes after B. It must not overwrite B's result/status/button state.
aGate.resolve();
assert.equal(await a, false, "stale A should be ignored on late completion");
assert.deepEqual(commits, ["B"], "late A must not commit UI-visible state");

console.log("optimization session reverse-completion regression: OK");
