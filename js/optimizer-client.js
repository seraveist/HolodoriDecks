import { runOptimization } from "./optimizer-core.js?v=1.3.1";

let requestId = 0;

export async function runOptimizationAsync(payload, {
  preferWorker = true,
  timeoutMs = 120_000,
  signal = null,
} = {}) {
  if (signal?.aborted) return { ok: false, cancelled: true };
  if (!preferWorker) return runOptimization(payload);
  const failed = () => ({ ok: false, reason: "계산을 완료하지 못했습니다. 다시 시도해 주세요." });
  if (typeof Worker === "undefined") return failed();
  let worker;
  try {
    worker = new Worker(new URL("./optimizer-worker.js?v=1.3.1", import.meta.url), { type: "module" });
  } catch {
    return failed();
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
    const fail = () => {
      if (signal?.aborted) {
        cancel();
        return;
      }
      finish(failed());
    };
    worker.addEventListener("message", (event) => {
      if (event.data?.id !== id || settled) return;
      if (!event.data?.ok) {
        fail();
        return;
      }
      finish(event.data.result);
    });
    worker.addEventListener("error", fail, { once: true });
    signal?.addEventListener?.("abort", cancel, { once: true });
    // A deadline ends this request. Never restart the same expensive search on
    // the UI thread while a worker is still computing it.
    timer = setTimeout(fail, Math.max(1_000, Number(timeoutMs) || 120_000));
    try {
      worker.postMessage({ id, payload });
    } catch {
      fail();
    }
  });
}
