import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareScoreCards } from "../js/card-prepare.js";
import { optimizeOwnedDeck } from "../js/recommend.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const appPort = 4173;
const appUrl = `http://${host}:${appPort}/`;
const storageKey = "holodori-decksim:v2";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cards = JSON.parse(fs.readFileSync(new URL("../data/generated/cards.json", import.meta.url), "utf8"));
const characters = JSON.parse(fs.readFileSync(new URL("../data/generated/characters.json", import.meta.url), "utf8"));
const masterRefs = JSON.parse(fs.readFileSync(new URL("../data/generated/master_refs.json", import.meta.url), "utf8"));
const chartIndex = JSON.parse(fs.readFileSync(new URL("../data/generated/chart-index.json", import.meta.url), "utf8"));
const chartEntry = chartIndex.charts?.["m0001:EXPERT"];
assert.ok(chartEntry, "m0001:EXPERT chart entry is required");

const selectable = cards.filter((card) => [4, 5].includes(Number(card.rarity))).slice(0, 12);
const charactersById = new Map(characters.map((row) => [row.id, row]));
const ownedCardSettings = Object.fromEntries(selectable.map((card) => [
  card.id,
  {
    level: Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1)),
    potential: 0,
  },
]));
const preparedCards = prepareScoreCards(cards, charactersById, ownedCardSettings, { masterRefs });
const ownedCardIds = selectable.map((card) => card.id);
const fixture = optimizeOwnedDeck({
  preparedCards,
  ownedCardIds,
  currentMembers: [null, null, null, null, null, null],
  lockedSlots: [false, false, false, false, false, false],
  music: null,
  difficulty: "EXPERT",
  playMode: "manual",
  simulationTarget: "score",
  separateRole: true,
  resultCount: 1,
});
assert.equal(fixture.ok, true, "could not build browser fixture");
const lockedDeckIds = fixture.members;

const genericState = {
  simulationTarget: "score",
  levelMode: "current",
  separateRole: true,
  members: [null, null, null, null, null, null],
  lockedSlots: [false, false, false, false, false, false],
  ownedCardIds,
  ownedCardSettings,
  musicId: "",
  difficulty: "EXPERT",
  playMode: "manual",
};

const noteCount = Number(chartEntry.fullComboNoteCount);
const sourceChart = {
  songId: "m0001",
  difficulty: "expert",
  upstreamChartHash: chartEntry.chartHash,
  chartAssetId: chartEntry.chartAssetId,
  fullComboNoteCount: noteCount,
  normalNoteCount: Number(chartEntry.normalNoteCount),
  events: Array.from({ length: noteCount }, (_, index) => [
    1_000_000 + index * 150_000,
    index % 17 === 0 ? 1 : 0,
    index % 29 === 0 ? 1 : 0,
  ]),
  specialMarkerMicroseconds: [15, 35, 55, 75, 95].map((second) => second * 1_000_000),
  specialStartsAtCombo: [90, 220, 350, 480, 610].map((combo) => Math.min(combo, noteCount)),
  feverMarkerMicroseconds: null,
  source: { sus: { sha256: "smoke-sus" }, metadata: { sha256: "smoke-meta" } },
};
const sourceText = JSON.stringify(sourceChart);
const sourceLength = Buffer.byteLength(sourceText);
const sourceSha = createHash("sha256").update(sourceText).digest("hex");
const runtimeEntry = {
  start: 0,
  end: sourceLength - 1,
  length: sourceLength,
  objectSha256: sourceSha,
  musicId: chartEntry.musicId,
  difficulty: chartEntry.difficulty,
  chartHash: chartEntry.chartHash,
  chartAssetId: chartEntry.chartAssetId,
  fullComboNoteCount: chartEntry.fullComboNoteCount,
  normalNoteCount: chartEntry.normalNoteCount,
};

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function resolveChrome() {
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const probe = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  throw new Error("Chrome/Chromium executable not found");
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill("SIGTERM"); } catch { return; }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2_000).then(() => {
      if (child.exitCode === null) {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }
    }),
  ]);
}

const profileDir = await mkdtemp(path.join(tmpdir(), "holodori-browser-smoke-"));
const server = spawn("python3", ["-m", "http.server", String(appPort), "--bind", host], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let chrome = null;
let socket = null;

try {
  await waitFor(async () => (await fetch(appUrl)).ok, 10_000, "local server did not start");

  let chromeStderr = "";
  chrome = spawn(resolveChrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => { chromeStderr += chunk; });

  const browserDebuggerUrl = await waitFor(() => {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited with ${chrome.exitCode}: ${chromeStderr.slice(-2000)}`);
    }
    return chromeStderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? null;
  }, 15_000, "Chrome remote debugging did not start");
  const debuggerUrl = new URL(browserDebuggerUrl);
  const debugOrigin = `http://${debuggerUrl.hostname}:${debuggerUrl.port}`;

  const targetResponse = await fetch(
    `${debugOrigin}/json/new?${encodeURIComponent(appUrl)}`,
    { method: "PUT" },
  );
  assert.equal(targetResponse.ok, true, `Chrome target creation failed: ${targetResponse.status}`);
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  function command(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text ?? "browser evaluation failed");
    }
    return result.result?.value;
  }

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Page.navigate", { url: appUrl });
  await waitFor(() => evaluate(`Boolean(document.querySelector("#owned-tab")
    && document.querySelector("#music-select")?.options.length > 2)`),
  20_000, "application did not load");

  const policy = await evaluate(`({
    targets: [...document.querySelector("#simulation-target").options].map((option) => option.value),
    rarities: [...document.querySelector("#owned-rarity-filter").options].map((option) => option.value),
  })`);
  assert.deepEqual(policy.targets, ["score", "potential"]);
  assert.ok(!policy.rarities.includes("3") && policy.rarities.includes("4") && policy.rarities.includes("5"));

  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(genericState))}); true`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector("#owned-tab-count")?.textContent === "12"`),
    20_000, "owned state did not reload");
  await evaluate(`document.querySelector("#auto-compose").click(); true`);
  await waitFor(() => evaluate(`Boolean(!document.querySelector("#auto-compose").disabled
    && document.querySelectorAll(".recommendation-result-card").length === 5)`),
  30_000, "generic TOP 5 calculation did not complete");

  const runtimeProbe = await evaluate(`(async () => {
    const module = await import('./js/chart-data.js?v=browser-smoke');
    const chartEntry = ${JSON.stringify(chartEntry)};
    const runtimeEntry = ${JSON.stringify(runtimeEntry)};
    const sourceText = ${JSON.stringify(sourceText)};
    let range = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      range = options.headers?.Range ?? options.headers?.range ?? '';
      return {
        status: 206,
        headers: { get: (name) => String(name).toLowerCase() === 'content-range'
          ? 'bytes 0-${sourceLength - 1}/${sourceLength}' : null },
        text: async () => sourceText,
        body: { cancel: async () => {} },
      };
    };
    try {
      const resources = {
        version: 'browser-smoke',
        chartsByKey: new Map([['m0001:EXPERT', chartEntry]]),
        runtimeIndex: { source: { url: 'https://example.test/pinned.json' } },
        runtimeChartsByKey: new Map([['m0001:EXPERT', runtimeEntry]]),
      };
      const exact = await module.loadSelectedChart(resources, 'm0001', 'EXPERT');
      globalThis.fetch = async () => { throw new Error('blocked'); };
      const fallback = await module.loadSelectedChart(resources, 'm0001', 'EXPERT');
      return {
        range,
        exact: Boolean(exact?.metadata?.sourceRuntime),
        notes: exact?.metadata?.notes?.length ?? 0,
        fallbackMetadata: fallback?.metadata ?? null,
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  })()`);
  assert.equal(runtimeProbe.range, `bytes=0-${sourceLength - 1}`);
  assert.equal(runtimeProbe.exact, true, "browser Runtime Exact conversion failed");
  assert.equal(runtimeProbe.notes, noteCount);
  assert.equal(runtimeProbe.fallbackMetadata, null, "browser Runtime failure did not fall back cleanly");

  console.log("browser smoke: ★4/★5 policy, generic TOP 5, browser Range/206/Content-Range/SHA Exact, and browser fallback OK");
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  await terminate(chrome);
  await terminate(server);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
