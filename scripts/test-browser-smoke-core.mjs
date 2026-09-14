import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareScoreCards } from "../js/card-prepare.js";
import { optimizeOwnedDeck } from "../js/recommend.js";
import { launchSmokeBrowser } from "./smoke-browser-launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const appPort = Number(process.env.BROWSER_SMOKE_PORT || 4173);
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
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  if (process.platform === "win32") {
    for (const folder of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)) {
      const candidate = path.join(folder, "Google", "Chrome", "Application", "chrome.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
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

const server = spawn(process.env.PYTHON_BIN ?? (process.platform === "win32" ? "py" : "python3"), ["-m", "http.server", String(appPort), "--bind", host], {
  cwd: root,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let chrome = null;
let socket = null;

try {
  await waitFor(async () => (await fetch(appUrl)).ok, 10_000, "local server did not start");

  chrome = await launchSmokeBrowser(resolveChrome());
  const debuggerUrl = new URL(chrome.debuggerUrl);
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
    targets: [...document.querySelectorAll('[name="calculation-mode"]')].map((input) => input.value),
    rarities: [...document.querySelector("#owned-rarity-filter").options].map((option) => option.value),
  })`);
  assert.deepEqual(policy.targets, ["unit", "expected", "maximum"]);
  assert.ok(!policy.rarities.includes("3") && policy.rarities.includes("4") && policy.rarities.includes("5"));

  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(genericState))}); true`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector("#owned-tab-count")?.textContent === "12"`),
    20_000, "owned state did not reload");
  await evaluate(`document.querySelector("#auto-compose").click(); true`);
  await waitFor(() => evaluate(`Boolean(!document.querySelector("#auto-compose").disabled
    && document.querySelectorAll(".recommendation-result-card").length === 5)`),
  30_000, "generic TOP 5 calculation did not complete");

  const genericDisplay = await evaluate(`({
    count: document.querySelectorAll('.recommendation-result-card').length,
    projectionPanels: document.querySelectorAll('.recommendation-result-card .song-projection').length,
    estimateNotes: document.querySelectorAll('.result-estimate-note').length,
  })`);
  assert.equal(genericDisplay.count, 5);
  assert.equal(genericDisplay.projectionPanels, 0, 'Generic results must not show reference-chart panels');
  assert.equal(genericDisplay.estimateNotes, 0, 'Do not prepend estimate disclaimers');

  // Optional screenshots also exercise the opened result at desktop/mobile sizes.
  if (process.env.BROWSER_SMOKE_ARTIFACT_DIR) {
    fs.mkdirSync(process.env.BROWSER_SMOKE_ARTIFACT_DIR, { recursive: true });
    for (const [label, width] of [["desktop", 1440], ["mobile", 390]]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate(`(() => {
        const card = document.querySelector('.recommendation-result-card');
        card.open = true;
        card.querySelector('.recommendation-result-body').scrollIntoView({ block: 'start' });
      })()`);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      const { data } = await command("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(process.env.BROWSER_SMOKE_ARTIFACT_DIR, `generic-order-${label}.png`), Buffer.from(data, "base64"));
    }
  }

  for (const simulationTarget of ["score", "potential"]) {
    const mode = simulationTarget === "potential" ? "maximum" : "expected";
    const selectedState = { ...genericState, simulationTarget, musicId: "m0049",
      members: lockedDeckIds, lockedSlots: Array(6).fill(true) };
    await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(selectedState))}); true`);
    await command("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate(`document.querySelector('#music-select')?.value === 'm0049'
      && document.querySelector('[name="calculation-mode"]:checked')?.value === ${JSON.stringify(mode)}
      && document.querySelector('#owned-tab-count')?.textContent === '12'`), 20_000, "selected song state did not reload");
    await evaluate(`document.querySelector('#auto-compose').click(); true`);
    await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
      && document.querySelectorAll('.recommendation-result-card').length === 1`),
      30_000, `selected song/${simulationTarget}: a fully preset composition must produce one result`);
    const selectedResult = await evaluate(`({
      count: document.querySelectorAll('.recommendation-result-card').length,
      genericReference: document.querySelectorAll('[data-order-basis="reference"]').length,
      slots: document.querySelectorAll('.recommendation-result-card .special-skill-order li').length,
      accuracy: document.querySelector('.song-projection-accuracy')?.textContent,
      label: document.querySelector('.result-summary-score > span')?.textContent,
      score: document.querySelector('.result-summary-score > strong')?.textContent,
      projected: [...document.querySelectorAll('.song-projection-score > strong')].map(el => el.textContent),
    })`);
    assert.equal(selectedResult.count, 1);
    assert.equal(selectedResult.genericReference, 0, "Selected songs must not display the generic reference");
    assert.equal(selectedResult.slots, 5);
    assert.ok(selectedResult.accuracy?.includes("실제 채보"));
    assert.equal(selectedResult.label, mode === "maximum" ? "악곡 최대 스코어" : "악곡 기대 스코어");
    assert.equal(selectedResult.score, selectedResult.projected[mode === "maximum" ? 1 : 0]);
  }

  // Exercise the controls themselves, including remembered song settings in unit mode.
  const retainedSong = await evaluate(`(() => {
    document.querySelector('[name="calculation-mode"][value="unit"]').click();
    return {
      hidden: document.querySelector('#song-settings').hidden,
      disabled: document.querySelector('#song-settings').disabled,
      song: document.querySelector('#music-select').value,
      count: document.querySelectorAll('.recommendation-result-card').length,
      separateLabel: document.querySelector('.member-separate-toggle span').textContent,
    };
  })()`);
  assert.deepEqual(retainedSong, { hidden: true, disabled: true, song: "m0049", count: 0, separateLabel: "리더를 편성에 제외" });
  await evaluate(`document.querySelector('#auto-compose').click(); true`);
  await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
    && document.querySelectorAll('.recommendation-result-card').length === 1`), 30_000, "unit goal with remembered song");
  assert.equal(await evaluate(`document.querySelectorAll('.song-projection').length`), 0);
  assert.equal(await evaluate(`document.querySelector('.result-summary-score > span').textContent`), "유닛 스코어");
  const retainedUnitScore = await evaluate(`document.querySelector('.result-summary-score > strong').textContent`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector('#owned-tab-count')?.textContent === '12'
    && document.querySelector('#music-select')?.value === 'm0049'`), 20_000, "remembered song reload");
  assert.equal(await evaluate(`document.querySelector('[name="calculation-mode"]:checked').value`), "unit");
  await evaluate(`document.querySelector('[name="calculation-mode"][value="expected"]').click(); true`);
  assert.equal(await evaluate(`document.querySelector('#song-settings').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('#music-select').value`), "m0049");
  assert.equal(await evaluate(`document.querySelector('#play-mode').value`), "manual");
  const songOptions = await evaluate(`(() => {
    const input = document.querySelector('#music-search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      canCalculate: !document.querySelector('#auto-compose').disabled,
      genericOption: Boolean(document.querySelector('.music-combobox-option.is-average')),
      count: document.querySelectorAll('.music-combobox-option').length,
    };
  })()`);
  assert.equal(songOptions.canCalculate, false, "song goals require a song");
  assert.equal(songOptions.genericOption, false, "generic evaluation belongs only to the goal selector");
  assert.ok(songOptions.count > 10);
  await evaluate(`document.querySelector('[name="calculation-mode"][value="unit"]').click(); true`);
  assert.equal(await evaluate(`document.querySelector('#auto-compose').disabled`), false);
  await evaluate(`document.querySelector('#auto-compose').click(); true`);
  await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
    && document.querySelectorAll('.recommendation-result-card').length === 1`), 30_000, "unit goal with no song");
  assert.equal(await evaluate(`document.querySelector('.result-summary-score > strong').textContent`), retainedUnitScore,
    "remembered song and manual play must not affect unit score");

  if (process.env.BROWSER_SMOKE_ARTIFACT_DIR) {
    for (const [label, width, theme] of [["desktop", 1280, "light"], ["mobile", 390, "dark"], ["narrow", 320, "light"]]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; true`);
      await evaluate(`document.querySelector('#music-select').value = 'm0049';
        document.querySelector('#music-select').dispatchEvent(new Event('change')); true`);
      for (const mode of ["unit", "expected", "maximum"]) {
        await evaluate(`document.querySelector('[name="calculation-mode"][value="${mode}"]').click();
          document.querySelector('#music-setting').scrollIntoView({block:'start'}); true`);
        await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        assert.equal(await evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`), false, `${label}/${mode} must fit the viewport`);
        const { data } = await command("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(process.env.BROWSER_SMOKE_ARTIFACT_DIR, `calculation-${label}-${mode}.png`), Buffer.from(data, "base64"));
      }
    }
  }

  const overlapIds = [
    "card-06003-5-uniq-0059-00", "card-06003-4-cmmn-0000-00", "card-00018-5-uniq-0068-00",
    "card-00027-5-uniq-0022-00", "card-06002-5-uniq-0066-00", "card-06004-5-uniq-0060-00",
  ];
  const overlapState = { ...genericState, calculationMode: "unit", ownedCardIds: overlapIds,
    members: overlapIds, lockedSlots: Array(6).fill(true), separateRole: true };
  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(overlapState))}); true`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector('#owned-tab-count')?.textContent === '6'
    && document.querySelectorAll('.member-slot.filled').length === 6`), 20_000, "leader exclusion fixture");
  assert.equal(await evaluate(`document.querySelector('#preset-status').hidden`), false);
  await evaluate(`document.querySelector('#separate-role').click(); document.querySelector('#auto-compose').click(); true`);
  await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
    && document.querySelectorAll('.recommendation-result-card').length === 1`), 30_000, "leader character permitted when exclusion is off");
  await evaluate(`document.querySelector('#separate-role').click(); true`);
  assert.equal(await evaluate(`document.querySelectorAll('.recommendation-result-card').length`), 0);
  await evaluate(`document.querySelector('#auto-compose').click(); true`);
  await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
    && document.querySelector('#recommendation-status').textContent.includes('리더를 편성에 제외')`), 20_000, "leader character excluded when enabled");
  assert.equal(await evaluate(`document.querySelectorAll('.recommendation-result-card').length`), 0);

  // I's support leader must render outfit separately, without adding it back
  // into Active in the UI. These are engine values, not calibrated game values.
  const outfitProfiles = [
    ["card-00010-5-uniq-0010-00", 40, 0], ["card-00022-5-uniq-0063-00", 80, 1],
    ["card-00018-5-uniq-0068-00", 60, 0], ["card-00027-5-uniq-0022-00", 70, 0],
    ["card-06002-5-uniq-0066-00", 40, 0], ["card-06004-5-uniq-0060-00", 70, 1],
  ];
  const outfitIds = outfitProfiles.map(([id]) => id);
  const outfitState = { ...genericState, members: outfitIds, lockedSlots: Array(6).fill(true),
    ownedCardIds: outfitIds,
    ownedCardSettings: Object.fromEntries(outfitProfiles.map(([id, level, potential]) => [id, { level, potential }])) };
  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(outfitState))}); true`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate(`document.querySelector('#owned-tab-count')?.textContent === '6'
    && document.querySelector('#music-select')?.value === ''`), 20_000, "outfit fixture did not reload");
  await evaluate(`document.querySelector('#auto-compose').click(); true`);
  await waitFor(() => evaluate(`!document.querySelector('#auto-compose').disabled
    && document.querySelectorAll('.recommendation-result-card').length === 1`), 30_000, "outfit calculation did not complete");
  const outfitRows = await evaluate(`([...document.querySelectorAll('.calculation-card:last-child .calculation-rows > span')]
    .map(row => ({ label: row.querySelector('i').textContent, value: row.querySelector('b').textContent })))`);
  assert.equal(outfitRows[0].label, "의상 스킬");
  assert.deepEqual(outfitRows.map(row => row.value), ["40.5%", "70.1%", "0.0%", "0.0%", "38.7%"]);
  if (process.env.BROWSER_SMOKE_ARTIFACT_DIR) {
    for (const [label, width] of [["desktop", 1440], ["mobile", 390]]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate(`(() => {
        const card = document.querySelector('.recommendation-result-card');
        card.open = true;
        card.querySelector('.calculation-breakdown').scrollIntoView({ block: 'start' });
      })()`);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      const { data } = await command("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(process.env.BROWSER_SMOKE_ARTIFACT_DIR, `outfit-breakdown-${label}.png`), Buffer.from(data, "base64"));
    }
  }

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

  for (const locale of ["en", "ja"]) {
    await evaluate(`localStorage.setItem('holodori-decksim:locale', '${locale}'); true`);
    await command("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate(`document.documentElement.lang === '${locale}'
      && document.querySelector('#music-select')?.options.length > 2`), 20_000, `${locale} controls load`);
    await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('[name="calculation-mode"][value="expected"]').click(); true`);
    const translated = await evaluate(`({
      labels: [...document.querySelectorAll('.calculation-mode-label')].map(el => el.textContent.trim()),
      heights: [...document.querySelectorAll('.calculation-mode-label')].map(el => el.getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    })`);
    assert.ok(translated.labels[1].includes(locale === "en" ? "Expected" : "期待"));
    assert.equal(translated.overflow, false, `${locale} narrow layout`);
    assert.ok(Math.max(...translated.heights) - Math.min(...translated.heights) < 1, `${locale} goal buttons have equal heights`);
  }
  console.log("browser smoke: three goals, state migration, song retention, leader exclusion, responsive/localized UI, Exact/fallback and TOP 5 OK");
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  try { await chrome?.close(); } finally { await terminate(server); }
}
