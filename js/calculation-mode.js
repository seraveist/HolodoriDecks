const MODES = new Set(["unit", "expected", "maximum"]);

export function getCalculationMode(state = {}) {
  if (MODES.has(state.calculationMode)) return state.calculationMode;
  // Migrate the old target/song pair without losing the user's song settings.
  if (!state.musicId) return "unit";
  return state.simulationTarget === "potential" ? "maximum" : "expected";
}

export function calculationSettings(state = {}) {
  const calculationMode = getCalculationMode(state);
  const unit = calculationMode === "unit";
  return {
    calculationMode,
    musicId: unit ? "" : state.musicId || "",
    difficulty: unit ? "EXPERT" : state.difficulty || "EXPERT",
    playMode: unit ? "auto" : state.playMode || "auto",
    simulationTarget: calculationMode === "maximum" ? "potential" : "score",
  };
}
