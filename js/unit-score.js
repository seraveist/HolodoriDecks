// Empirical formation-detail model. Song/SP-slot evaluation lives in chart-score.js.
// Constants and rounding were tested against the observations through BJ; they
// do not establish the game's internal chart. AX retains a known 0.1pp residual.
export const UNIT_DISPLAY_MODEL = "normalized-200-v1";
// Extends the same model to outfit support. I/J/M reproduce retrospectively;
// their inherited member-board inputs are recorded in the support fixture.
export const UNIT_SUPPORT_DISPLAY_MODEL = "normalized-200-support-v1";
export const UNIT_DISPLAY_CONTEXT = Object.freeze({ duration: 200, notes: 800 });
const WEIGHT_CACHE = new Map();
const CACHE_LIMIT = 2048;
const finite = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
export const ceilUnit = (x, digits = 1) => {
  const scale = 10 ** digits;
  return Math.ceil(finite(x) * scale - 1e-8) / scale + 0;
};

function normalizedWeights(members) {
  // Canonical timing order makes cache reuse and decimal-boundary handling
  // independent of the user's SP placement. Equal timings receive equal weights.
  const sorted = members.map((m, index) => ({ ...m, index }))
    .sort((a, b) => a.interval - b.interval || a.duration - b.duration || a.probability - b.probability);
  const key = sorted.map(m => `${m.interval},${m.duration},${m.probability}`).join("|");
  let weights = WEIGHT_CACHE.get(key);
  if (!weights) {
    weights = sorted.map(() => 0);
    for (let t = 1; t <= UNIT_DISPLAY_CONTEXT.duration; t++) {
      let probabilitySum = 0;
      const on = sorted.map(m => {
        const enabled = t >= m.interval
          && t - Math.floor((t + 1e-9) / m.interval) * m.interval < m.duration - 1e-9;
        if (enabled) probabilitySum += m.probability;
        return enabled;
      });
      const denominator = Math.max(1, probabilitySum);
      sorted.forEach((m, i) => {
        if (on[i]) weights[i] += m.probability / denominator / UNIT_DISPLAY_CONTEXT.duration;
      });
    }
    if (WEIGHT_CACHE.size >= CACHE_LIMIT) WEIGHT_CACHE.delete(WEIGHT_CACHE.keys().next().value);
    WEIGHT_CACHE.set(key, weights);
  }
  const result = members.map(() => 0);
  sorted.forEach((m, i) => { result[m.index] = weights[i]; });
  return result;
}

// Inputs are resolved per-member Active values, targeted Passive support,
// optional board rates, and condition-resolved SP values; no account defaults.
export function unitDisplayBonuses(members, { leaderOutfitSupportPct = 0, leaderBoardSupportPct = 0, maximize = false } = {}) {
  const O = Math.max(0, finite(leaderOutfitSupportPct));
  const L = Math.max(0, finite(leaderBoardSupportPct));
  const base = members.map(m => ({
    ...m,
    rawProbability: Math.max(0, Math.min(1, finite(m.probability))),
    probability: maximize ? (finite(m.probability) > 0 ? 1 : 0) : ceilUnit(Math.max(0, Math.min(1, finite(m.probability))) * 100) / 100,
    interval: Math.max(0.001, finite(m.interval)),
    duration: Math.max(0, finite(m.duration)),
    value: Math.max(0, finite(m.value)),
    support: Math.max(0, finite(m.support)),
    rate: Math.max(0, finite(m.rate)),
    frequency: Math.max(0, finite(m.frequency)),
  }));
  const adjusted = base.map(m => ({
    ...m,
    probability: maximize ? m.probability : ceilUnit(Math.min(1, m.rawProbability * (1 + m.rate / 100)) * 100) / 100,
    interval: m.interval / (1 + m.frequency / 100),
  }));
  const baseWeights = normalizedWeights(base);
  const boardWeights = normalizedWeights(adjusted);
  const A = base.reduce((sum, m, i) => sum + baseWeights[i] * ceilUnit(m.value), 0);
  const BP = base.reduce((sum, m, i) => sum + boardWeights[i] * ceilUnit(m.value * (1 + (O + L + m.support) / 100)), 0);
  const active = ceilUnit(A);
  const pool = Number((ceilUnit(BP) - active).toFixed(9));
  let passiveWeight = 0;
  let boardWeight = 0;
  let outfitWeight = 0;
  base.forEach(m => {
    const w = (maximize ? m.probability : m.rawProbability) * m.value * m.duration / m.interval;
    outfitWeight += w * O;
    passiveWeight += w * m.support;
    boardWeight += w * 100 * ((1 + (maximize ? 0 : m.rate) / 100) * (1 + m.frequency / 100) * (1 + L / 100) - 1);
  });
  const weight = outfitWeight + passiveWeight + boardWeight;
  const rawOutfit = weight > 0 ? pool * outfitWeight / weight : 0;
  const rawPassive = weight > 0 ? pool * passiveWeight / weight : 0;
  const passive = ceilUnit(rawPassive);
  const board = weight > 0 ? ceilUnit(pool - rawOutfit - rawPassive) : 0;
  const spSupport = members.reduce((sum, m) => sum + ceilUnit(finite(m.specialSupport) * finite(m.specialDuration) / 120, 2), 0);
  const spRate = maximize ? 0 : members.reduce((sum, m) => sum + finite(m.specialRate), 0);
  const special = ceilUnit(active * (spSupport + spRate / 20) / 100);
  return { outfit: ceilUnit(rawOutfit), active, passive, board, special };
}
