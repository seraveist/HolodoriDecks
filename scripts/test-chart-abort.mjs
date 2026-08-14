import assert from "node:assert/strict";
import { loadSelectedChart } from "../js/chart-data.js";

const chart = {
  musicId: "m-test",
  difficulty: "EXPERT",
  chartHash: "chart-hash",
  chartAssetId: "chart_m-test_expert",
  fullComboNoteCount: 1,
  normalNoteCount: 1,
};
const runtime = {
  ...chart,
  start: 0,
  end: 9,
  length: 10,
  objectSha256: "",
};
const resources = {
  version: "test",
  chartsByKey: new Map([["m-test:EXPERT", chart]]),
  runtimeIndex: { source: { url: "https://example.test/runtime.json" } },
  runtimeChartsByKey: new Map([["m-test:EXPERT", runtime]]),
};

const originalFetch = globalThis.fetch;
const controller = new AbortController();
let receivedSignal = false;
let aborted = false;

try {
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    receivedSignal = options.signal === controller.signal;
    options.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

  const loading = loadSelectedChart(resources, "m-test", "EXPERT", { signal: controller.signal });
  controller.abort();
  const result = await loading;

  assert.equal(receivedSignal, true, "chart fetch should receive the calculation AbortSignal");
  assert.equal(aborted, true, "aborting the calculation should abort the chart fetch");
  assert.equal(result, null, "an aborted chart load must not return a fallback chart for a stale request");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("chart fetch AbortSignal regression: OK");
