export function createOptimizationSession() {
  let generation = 0;
  let active = null;

  function isCurrent(request) {
    return Boolean(request)
      && active === request
      && request.generation === generation
      && !request.signal.aborted;
  }

  return {
    begin(signature) {
      active?.controller.abort();
      const controller = new AbortController();
      const request = {
        controller,
        signal: controller.signal,
        generation: ++generation,
        signature: String(signature ?? ""),
      };
      active = request;
      return request;
    },

    invalidateIfChanged(signature) {
      if (!active || active.signature === String(signature ?? "")) return false;
      active.controller.abort();
      active = null;
      generation += 1;
      return true;
    },

    isCurrent,

    finish(request) {
      if (!isCurrent(request)) return false;
      active = null;
      return true;
    },

    get active() {
      return active;
    },
  };
}
