import { runOptimization } from "./optimizer-core.js?v=1.1.2";

self.addEventListener("message", (event) => {
  const { id, payload } = event.data ?? {};
  try {
    self.postMessage({ id, ok: true, result: runOptimization(payload) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});