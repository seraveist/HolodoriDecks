import { getCalculationMode } from "../calculation-mode.js?v=1.3.1";
import { requiredElement } from "./dom.js?v=1.3.1";

export function mountMemberOptions(store) {
  const modes = [...requiredElement(".calculation-modes").querySelectorAll('[name="calculation-mode"]')];
  const levelMode = requiredElement("#level-mode");
  const separateRole = requiredElement("#separate-role");
  const songSettings = requiredElement("#song-settings");

  modes.forEach((input) => input.addEventListener("change", () => {
    if (input.checked) store.setState({ calculationMode: input.value });
  }));
  levelMode.addEventListener("change", () => store.setState({ levelMode: levelMode.value }));
  separateRole.addEventListener("change", () => store.setState({ separateRole: separateRole.checked }));

  return function syncMemberOptions(state) {
    const mode = getCalculationMode(state);
    modes.forEach((input) => { input.checked = input.value === mode; });
    songSettings.hidden = mode === "unit";
    songSettings.disabled = mode === "unit";
    levelMode.value = state.levelMode;
    separateRole.checked = state.separateRole;
  };
}
