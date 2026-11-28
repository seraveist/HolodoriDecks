import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { launchSmokeBrowser } from "./smoke-browser-launch.mjs";

const revision = process.env.DEPLOYMENT_SHA;
assert.match(revision ?? "", /^[0-9a-f]{40}$/, "DEPLOYMENT_SHA must be a commit SHA");
const page = new URL(process.env.PRODUCTION_URL || "https://holosims.net/");
page.searchParams.set("v", revision);
const executable = process.env.CHROME_BIN || execFileSync("which", ["google-chrome"], { encoding: "utf8" }).trim();
const browser = await launchSmokeBrowser(executable);
let socket;

async function probe(expectedRevision) {
  const { loadChartResources, loadSelectedChart } = await import(`/js/chart-data.js?v=${expectedRevision}`);
  const response = await fetch(`/data/generated/manifest.json?v=${expectedRevision}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Master manifest returned HTTP ${response.status}`);
  const manifest = await response.json();
  const resources = await loadChartResources(manifest);
  const exact = [...resources.runtimeChartsByKey.keys()].find((key) => !resources.chartsByKey.get(key)?.metadataPath);
  const preferred = "m0001:EXPERT";
  const runtimeKey = resources.runtimeChartsByKey.has(preferred) && !resources.chartsByKey.get(preferred)?.metadataPath
    ? preferred : exact;
  const localKey = [...resources.chartsByKey.keys()].find((key) => resources.chartsByKey.get(key).metadataPath);
  return Promise.all([runtimeKey, localKey].map(async (key) => {
    if (!key) throw new Error("Expected both a Runtime-only and a Local Exact sample");
    const result = await loadSelectedChart(resources, ...key.split(":"), { signal: AbortSignal.timeout(20_000) });
    return {
      key,
      source: !result?.metadata ? "missing" : result.metadata.sourceRuntime ? "runtime" : "local",
      notes: result?.metadata?.notes?.length,
      expectedNotes: result?.fullComboNoteCount,
      specials: result?.metadata?.skills?.length,
    };
  }));
}

try {
  const debuggerUrl = new URL(browser.debuggerUrl);
  const targetUrl = `http://${debuggerUrl.host}/json/new?about:blank`;
  const target = await fetch(targetUrl, { method: "PUT", signal: AbortSignal.timeout(10_000) });
  assert.ok(target.ok, `Chrome target creation failed: HTTP ${target.status}`);
  socket = new WebSocket((await target.json()).webSocketDebuggerUrl);
  const connected = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Chrome debugging connection failed")), { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const networkErrors = [];
  socket.addEventListener("message", ({ data }) => {
    const reply = JSON.parse(data);
    if (reply.method === "Network.loadingFailed" && !reply.params.canceled) {
      networkErrors.push(reply.params.blockedReason || reply.params.errorText);
    }
    const call = pending.get(reply.id);
    if (!call) return;
    pending.delete(reply.id);
    const error = reply.error?.message || reply.result?.exceptionDetails?.exception?.description
      || reply.result?.exceptionDetails?.text;
    if (error) call.reject(new Error(error));
    else call.resolve(reply.result);
  });
  function command(method, params) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return result.result?.value;
  }
  const rows = await Promise.race([
    (async () => {
      await connected;
      await command("Network.enable");
      const navigation = await command("Page.navigate", { url: page.href });
      assert.ok(!navigation.errorText, navigation.errorText);
      let actual;
      for (let attempt = 0; attempt < 30; attempt++) {
        actual = await evaluate('document.querySelector("[data-card-asset-revision]")?.dataset.cardAssetRevision');
        if (actual === revision) return evaluate(`(${probe})(${JSON.stringify(revision)})`);
        await delay(500);
      }
      throw new Error(`Browser expected ${revision}, received ${actual}`);
    })(),
    delay(55_000, null, { ref: false }).then(() => { throw new Error("Production Exact browser probe timed out"); }),
  ]);
  assert.deepEqual(rows.map((row) => row.source), ["runtime", "local"], JSON.stringify({ rows, networkErrors }));
  for (const row of rows) {
    assert.ok(row.notes > 0 && row.notes === row.expectedNotes && row.specials === 5, JSON.stringify(row));
    console.log(`[production-exact] ${row.key} · ${row.source} · ${row.notes} notes · ${row.specials} SP slots`);
  }
} finally {
  socket?.close();
  await browser.close();
}
