import { requiredElement } from "./dom.js?v=20260811.19";

export function mountMemberOptions(store) {
  const simulationTarget = requiredElement("#simulation-target");
  const levelMode = requiredElement("#level-mode");
  const separateRole = requiredElement("#separate-role");

  simulationTarget.addEventListener("change", () => store.setState({ simulationTarget: simulationTarget.value }));
  levelMode.addEventListener("change", () => store.setState({ levelMode: levelMode.value }));
  separateRole.addEventListener("change", () => store.setState({ separateRole: separateRole.checked }));

  return function syncMemberOptions(state) {
    simulationTarget.value = state.simulationTarget;
    levelMode.value = state.levelMode;
    separateRole.checked = state.separateRole;
  };
}
