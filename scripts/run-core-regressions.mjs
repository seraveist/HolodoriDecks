// Shared production regressions used by collection, PR validation and Pages.
// Separate processes preserve test isolation and stop on the first failure.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tests = [
  "scripts/test-chart-scoring.mjs",
  "scripts/test-song-score-invariants.mjs",
  "scripts/test-song-corpus.mjs",
  "scripts/test-targeted-passive-support.mjs",
  "scripts/test-passive-stat-rounding.mjs",
  "scripts/test-passive-target-priority.mjs",
  "scripts/test-unit-observations.mjs",
  "scripts/test-support-stacking.mjs",
  "scripts/test-unit-support-costumes.mjs",
  "scripts/test-generic-order.mjs",
  "scripts/test-song-representative-order.mjs",
  "scripts/test-card-preparation.mjs",
  "scripts/test-simulation-targets.mjs",
  "scripts/test-collision-choice.mjs",
  "scripts/test-exact-global-search.mjs",
  "scripts/test-exact-pruning.mjs",
  "scripts/test-beam-search.mjs",
  "scripts/test-exact-runtime-source.mjs",
  "scripts/test-master-source.mjs",
  "scripts/test-optimization-session.mjs",
  "scripts/test-chart-abort.mjs",
];
for (const script of tests) {
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
