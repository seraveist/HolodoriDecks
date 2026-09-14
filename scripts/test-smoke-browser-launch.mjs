import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { launchSmokeBrowser } from "./smoke-browser-launch.mjs";

const profiles = [];
let starts = 0;
let stops = 0;
function fakeSpawn(scenario) {
  return (_executable, args, options) => {
    assert.equal(options.windowsHide, true);
    const profile = args.find((arg) => arg.startsWith("--user-data-dir=")).split("=").slice(1).join("=");
    profiles.push(profile);
    starts++;
    const child = new EventEmitter();
    Object.assign(child, { pid: starts, exitCode: null, signalCode: null, stderr: new PassThrough() });
    child.kill = () => { stops++; child.signalCode = "SIGTERM"; child.emit("exit"); return true; };
    queueMicrotask(() => scenario(child, profile));
    return child;
  };
}
const options = { timeoutMs: 25, pollMs: 2, onRetry() {} };
const retried = await launchSmokeBrowser("fake", { ...options, spawnProcess: fakeSpawn((child) => {
  if (starts === 1) {
    child.stderr.write("temporary startup crash"); child.exitCode = 1; child.emit("exit");
  } else child.stderr.write("DevTools listening on ws://127.0.0.1:9222/devtools/browser/test\n");
}) });
assert.equal(starts, 2);
assert.equal(new Set(profiles).size, 2);
assert.equal(fs.existsSync(profiles[0]), false);
assert.equal(retried.debuggerUrl, "ws://127.0.0.1:9222/devtools/browser/test");
await retried.close();
assert.equal(stops, 1);

const fallback = await launchSmokeBrowser("fake", { ...options, spawnProcess: fakeSpawn((_child, profile) => {
  fs.writeFileSync(path.join(profile, "DevToolsActivePort"), "9223\n/devtools/browser/file-endpoint\n");
}) });
assert.equal(fallback.debuggerUrl, "ws://127.0.0.1:9223/devtools/browser/file-endpoint");
await fallback.close();

const before = starts;
await assert.rejects(launchSmokeBrowser("fake", { ...options, spawnProcess: fakeSpawn((child) => {
  child.stderr.write("hung startup diagnostic");
}) }), (error) => /Attempt 3\/3/.test(error.message) && /hung startup diagnostic/.test(error.message));
assert.equal(starts - before, 3);
assert.equal(stops, 5);

const missingBefore = starts;
await assert.rejects(launchSmokeBrowser("missing", { ...options, spawnProcess: fakeSpawn((child) => {
  child.pid = undefined;
  child.emit("error", Object.assign(new Error("missing executable"), { code: "ENOENT" }));
}) }), /missing executable/);
assert.equal(starts - missingBefore, 1);
for (const profile of profiles) assert.equal(fs.existsSync(profile), false, "every attempt must remove its profile");
console.log("[browser-startup] Retry, fresh profiles, active-port fallback, permanent failures and cleanup passed.");
