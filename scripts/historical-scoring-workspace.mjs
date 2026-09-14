import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Historical forecasts must reproduce with their original engine, not today's
// service. Make an explicit, isolated workspace; do not alter source hashes or
// route production tests through a legacy module.
export function historicalScoringWorkspace(root) {
  const archive = path.join(root, "analysis/unit-score/archive/score-v0.9.js");
  const archived = fs.readFileSync(archive);
  const expected = JSON.parse(fs.readFileSync(path.join(root, "analysis/unit-score/archive/runtime-v0.9.json"), "utf8"));
  if (sha256(archived) !== expected.scoreSHA256) {
    throw new Error("Archived scoring engine bytes changed");
  }
  const inputs = fs.readFileSync(path.join(root, "analysis/unit-score/archive/runtime-v0.9-inputs.json.gz"));
  if (sha256(inputs) !== expected.inputs.sha256) throw new Error("Archived scoring inputs changed");
  const snapshot = JSON.parse(gunzipSync(inputs).toString("utf8"));
  if (snapshot.schemaVersion !== 1 || snapshot.gitCommit !== expected.gitCommit
    || JSON.stringify(Object.keys(snapshot.files).sort()) !== JSON.stringify(Object.keys(expected.inputs.files).sort())) {
    throw new Error("Archived scoring input manifest mismatch");
  }
  for (const [relative, contents] of Object.entries(snapshot.files)) {
    if (!/^(data\/generated|js)\/[\w.-]+$/.test(relative)
      || sha256(contents) !== expected.inputs.files[relative]) {
      throw new Error(`Archived scoring input mismatch: ${relative}`);
    }
  }
  const parent = path.join(root, ".local/scoring-validation");
  fs.mkdirSync(parent, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(parent, "historical-"));
  // Research scripts remain reviewable, but all data and runtime dependencies
  // come from the original checkpoint, even when today's master data changes.
  for (const directory of ["analysis", "scripts"]) {
    fs.cpSync(path.join(root, directory), path.join(workspace, directory), { recursive: true });
  }
  for (const [relative, contents] of Object.entries(snapshot.files)) {
    const destination = path.join(workspace, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  fs.copyFileSync(archive, path.join(workspace, "js/score.js"));
  return workspace;
}
