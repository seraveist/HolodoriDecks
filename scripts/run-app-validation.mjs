// Current service checks. Historical research has its own conditional CI job.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(...args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function syntax(directory) {
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) syntax(relative);
    else if (relative.endsWith(".js") || relative.endsWith(".mjs")) run("--check", relative);
  }
}
syntax("js");
syntax("scripts");
run("scripts/check-version.mjs");
for (const module of ["i18n", "theme", "data", "chart-data", "chart-score", "order", "state",
  "score", "card-prepare", "recommend", "optimizer-core", "optimizer-client", "optimization-session",
  ...["cards", "dom", "member", "modal", "music", "owned", "result", "target", "card-detail"].map(m => `ui/${m}`)]) {
  await import(new URL(`../js/${module}.js`, import.meta.url));
}
for (const script of [
  "run-core-regressions", "test-board-state", "test-board-paths", "test-board-data",
  "test-board-scoring", "test-board-browser", "test-unit-display", "test-calculation-modes",
  "test-search-order-bounds", "test-m0049-exact-real", "test-song-search-real-data",
  // This wrapper runs optimizer-client and browser-startup checks once.
  "test-browser-smoke", "test-historical-scoring-workspace",
]) run(`scripts/${script}.mjs`);
const { scoreEngineSelfTest } = await import("../js/score.js");
const { exactShortlistSize, recommendationValue } = await import("../js/recommend.js");
const probe = { rankingScore: 100, potentialRankingScore: 140 };
if (recommendationValue(probe, "score") !== 100 || recommendationValue(probe, "potential") !== 140
    || scoreEngineSelfTest().maxAbsError !== 0 || exactShortlistSize(700, 50) <= 10) {
  throw new Error("Scoring calibration or recommendation target regression");
}
