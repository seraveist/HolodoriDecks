import { t } from "../i18n.js?v=20260812.1";
import { escapeHtml } from "./cards.js?v=20260813.2";
import { requiredElement } from "./dom.js?v=20260812.1";

export function mountMusicControls(music, store) {
  const musicSelect = requiredElement("#music-select");
  const difficultySelect = requiredElement("#difficulty-select");
  const playModeSelect = requiredElement("#play-mode");

  musicSelect.innerHTML = [
    `<option value="">${escapeHtml(t("music.average"))}</option>`,
    ...music.map((song) => `<option value="${escapeHtml(song.id)}">${escapeHtml(song.title)} · ${escapeHtml(song.singer_name)}</option>`),
  ].join("");

  musicSelect.addEventListener("change", () => store.setState({ musicId: musicSelect.value }));
  difficultySelect.addEventListener("change", () => store.setState({ difficulty: difficultySelect.value }));
  playModeSelect.addEventListener("change", () => store.setState({ playMode: playModeSelect.value }));

  return function syncMusicControls(state) {
    musicSelect.value = state.musicId;
    difficultySelect.value = state.difficulty;
    playModeSelect.value = state.playMode;
  };
}
