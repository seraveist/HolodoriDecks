import { runOptimization } from "./optimizer-core.js?v=1.1.0";

let requestId = 0;

export async function runOptimizationAsync(payload, { preferWorker = true } = {}) {
  if (!preferWorker || typeof Worker === "undefined") return runOptimization(payload);
  let worker;
  try {
    worker = new Worker(new URL("./optimizer-worker.js?v=1.1.0", import.meta.url), { type: "module" });
  } catch {
    return runOptimization(payload);
  }
  const id = ++requestId;
  return await new Promise((resolve) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(runOptimization(payload));
    };
    worker.addEventListener("message", (event) => {
      if (event.data?.id !== id || settled) return;
      if (!event.data?.ok) {
        fallback();
        return;
      }
      settled = true;
      worker.terminate();
      resolve(event.data.result);
    });
    worker.addEventListener("error", fallback, { once: true });
    try {
      worker.postMessage({ id, payload });
    } catch {
      fallback();
    }
  });
}
