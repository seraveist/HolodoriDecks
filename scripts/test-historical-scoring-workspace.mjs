import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { historicalScoringWorkspace } from "./historical-scoring-workspace.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const parent = path.join(root, ".local/scoring-validation");
fs.mkdirSync(parent, { recursive: true });
const fixture = fs.mkdtempSync(path.join(parent, "isolation-test-"));
try {
  fs.cpSync(path.join(root, "analysis/unit-score/archive"), path.join(fixture, "analysis/unit-score/archive"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "scripts"));
  fs.mkdirSync(path.join(fixture, "data/generated"), { recursive: true });
  fs.mkdirSync(path.join(fixture, "js"));
  const latestCards = JSON.stringify([{ id: "new-upstream-card", name: "Changed master snapshot" }]);
  fs.writeFileSync(path.join(fixture, "data/generated/cards.json"), latestCards);
  fs.writeFileSync(path.join(fixture, "js/score.js"), "throw new Error('Current engine must not run historical forecasts');");
  fs.writeFileSync(path.join(fixture, "js/chart-score.js"), "export const changedAPI = true;");
  const workspace = historicalScoringWorkspace(fixture);
  const expected = JSON.parse(fs.readFileSync(path.join(root, "analysis/unit-score/experiments/baseline-passive-AK-20260909.json"))).sourceHashes;
  for (const file of ["data/generated/cards.json", "data/generated/characters.json", "data/generated/master_refs.json", "js/score.js", "js/order-reference.js"]) {
    const contents = fs.readFileSync(path.join(workspace, file), "utf8");
    const normalized = file.endsWith(".json") ? JSON.stringify(JSON.parse(contents)) : contents.replaceAll("\r\n", "\n");
    assert.equal(createHash("sha256").update(normalized).digest("hex"), expected[file], file);
  }
  assert.equal(fs.readFileSync(path.join(fixture, "data/generated/cards.json"), "utf8"), latestCards);
  assert.doesNotMatch(fs.readFileSync(path.join(workspace, "js/chart-score.js"), "utf8"), /changedAPI/);
  fs.appendFileSync(path.join(fixture, "analysis/unit-score/archive/runtime-v0.9-inputs.json.gz"), "corrupt");
  assert.throws(() => historicalScoringWorkspace(fixture), /Archived scoring inputs changed/);
} finally {
  const resolved = path.resolve(fixture);
  assert.equal(path.dirname(resolved), path.resolve(parent));
  assert.ok(path.basename(resolved).startsWith("isolation-test-"));
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log("[historical-workspace] New master data/runtime stay isolated; original hashes and archive integrity verified.");
