import { runOptimization } from "./optimizer-core.js?v=1.1.2";

let requestId = 0;

export async function runOptimizationAsync(payload, {
  preferWorker = true,
  timeoutMs = 30_000,
  signal = null,
} = {}) {
  if (signal?.aborted) return { ok: false, cancelled: true };
  if (!preferWorker || typeof Worker === "undefined") return runOptimization(payload);
  let worker;
  try {
    worker = new Worker(new URL("./optimizer-worker.js?v=1.1.2", import.meta.url), { type: "module" });
  } catch {
    return runOptimization(payload);
  }
  const id = ++requestId;
  return await new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const cancel = () => finish({ ok: false, cancelled: true });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.("abort", cancel);
      worker.terminate();
      resolve(result);
    };
    const fallback = () => {
      if (signal?.aborted) {
        cancel();
        return;
      }
      finish(runOptimization(payload));
    };
    worker.addEventListener("message", (event) => {
      if (event.data?.id !== id || settled) return;
      if (!event.data?.ok) {
        fallback();
        return;
      }
      finish(event.data.result);
    });
    worker.addEventListener("error", fallback, { once: true });
    signal?.addEventListener?.("abort", cancel, { once: true });
    timer = setTimeout(fallback, Math.max(1_000, Number(timeoutMs) || 30_000));
    try {
      worker.postMessage({ id, payload });
    } catch {
      fallback();
    }
  });
}
