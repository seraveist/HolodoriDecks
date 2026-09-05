import { getLocale } from "../i18n.js?v=20260812.1";
import { requiredElement } from "./dom.js?v=20260812.1";

const TARGET_COPY = Object.freeze({
  ko: {
    genericScore: "최고 유닛 스코어",
    genericPotential: "최고 잠재 유닛 스코어",
    songScore: "최고 예상 평균 스코어",
    songPotential: "최고 잠재 스코어",
  },
  en: {
    genericScore: "Best Unit Score",
    genericPotential: "Best Potential Unit Score",
    songScore: "Best Estimated Average Score",
    songPotential: "Best Potential Score",
  },
  ja: {
    genericScore: "最高ユニットスコア",
    genericPotential: "最高潜在ユニットスコア",
    songScore: "最高予想平均スコア",
    songPotential: "最高潜在スコア",
  },
});

function copy() {
  return TARGET_COPY[getLocale()] ?? TARGET_COPY.ko;
}

function syncTargetLabels(select, songSelected) {
  const labels = copy();
  const score = select.querySelector('option[value="score"]');
  const potential = select.querySelector('option[value="potential"]');
  if (score) score.textContent = songSelected ? labels.songScore : labels.genericScore;
  if (potential) potential.textContent = songSelected ? labels.songPotential : labels.genericPotential;
}

export function mountMemberOptions(store) {
  const simulationTarget = requiredElement("#simulation-target");
  const levelMode = requiredElement("#level-mode");
  const separateRole = requiredElement("#separate-role");

  simulationTarget.addEventListener("change", () => store.setState({ simulationTarget: simulationTarget.value }));
  levelMode.addEventListener("change", () => store.setState({ levelMode: levelMode.value }));
  separateRole.addEventListener("change", () => store.setState({ separateRole: separateRole.checked }));

  return function syncMemberOptions(state) {
    syncTargetLabels(simulationTarget, Boolean(state.musicId));
    simulationTarget.value = state.simulationTarget;
    levelMode.value = state.levelMode;
    separateRole.checked = state.separateRole;
  };
}
