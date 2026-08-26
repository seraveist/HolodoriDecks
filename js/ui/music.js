import { getLocale, localeCompare, t } from "../i18n.js?v=20260812.1";
import { escapeHtml } from "./cards.js?v=20260813.2";
import { requiredElement } from "./dom.js?v=20260812.1";

const MUSIC_COPY = Object.freeze({
  ko: {
    searchAria: "악곡 검색",
    searchPlaceholder: "곡명, 홀로멤 또는 Music ID 검색",
    sortLabel: "정렬",
    gameOrder: "인게임 순",
    latest: "최신곡 순",
    title: "곡명 순",
    singer: "가수명 순",
    noResults: "검색 결과가 없습니다.",
  },
  en: {
    searchAria: "Search songs",
    searchPlaceholder: "Search title, talent, or Music ID",
    sortLabel: "Sort",
    gameOrder: "In-game order",
    latest: "Newest first",
    title: "Title",
    singer: "Singer",
    noResults: "No matching songs.",
  },
  ja: {
    searchAria: "楽曲検索",
    searchPlaceholder: "曲名、ホロメン、Music IDで検索",
    sortLabel: "並び順",
    gameOrder: "ゲーム内順",
    latest: "新着順",
    title: "曲名順",
    singer: "歌手名順",
    noResults: "該当する楽曲がありません。",
  },
});

function copy() {
  return MUSIC_COPY[getLocale()] ?? MUSIC_COPY.ko;
}

function numericOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareMusic(a, b, mode) {
  if (mode === "latest") {
    return numericOrder(b.start_time, 0) - numericOrder(a.start_time, 0)
      || numericOrder(b.order, 0) - numericOrder(a.order, 0)
      || localeCompare(b.id, a.id);
  }
  if (mode === "title") {
    return localeCompare(a.title, b.title)
      || localeCompare(a.singer_name, b.singer_name)
      || localeCompare(a.id, b.id);
  }
  if (mode === "singer") {
    return localeCompare(a.singer_name, b.singer_name)
      || localeCompare(a.title, b.title)
      || localeCompare(a.id, b.id);
  }
  return numericOrder(a.order) - numericOrder(b.order) || localeCompare(a.id, b.id);
}

function matchesMusic(song, query) {
  if (!query) return true;
  return `${song.title} ${song.singer_name} ${song.id}`.toLocaleLowerCase().includes(query);
}

export function mountMusicControls(music, store) {
  const musicSelect = requiredElement("#music-select");
  const difficultySelect = requiredElement("#difficulty-select");
  const playModeSelect = requiredElement("#play-mode");
  const musicField = musicSelect.closest(".field");
  const musicGrid = musicField?.closest(".music-grid");
  const musicById = new Map(music.map((song) => [song.id, song]));
  const hasReleaseTime = music.some((song) => Number.isFinite(Number(song.start_time)) && Number(song.start_time) > 0);
  const labels = copy();

  const toolbar = document.createElement("div");
  toolbar.className = "music-search-toolbar";
  toolbar.style.cssText = "grid-column:1/-1;display:flex;gap:10px;align-items:end;flex-wrap:wrap";
  toolbar.innerHTML = `
    <label class="search-field" style="flex:1 1 240px">
      <span class="sr-only">${escapeHtml(labels.searchAria)}</span>
      <input id="music-search" type="search" placeholder="${escapeHtml(labels.searchPlaceholder)}" aria-label="${escapeHtml(labels.searchAria)}" autocomplete="off">
    </label>
    <label class="field compact-field" style="flex:0 1 180px">
      <span>${escapeHtml(labels.sortLabel)}</span>
      <select id="music-sort" aria-label="${escapeHtml(labels.sortLabel)}">
        <option value="game" selected>${escapeHtml(labels.gameOrder)}</option>
        <option value="latest"${hasReleaseTime ? "" : " disabled"}>${escapeHtml(labels.latest)}</option>
        <option value="title">${escapeHtml(labels.title)}</option>
        <option value="singer">${escapeHtml(labels.singer)}</option>
      </select>
    </label>`;
  if (musicGrid && musicField) musicGrid.insertBefore(toolbar, musicField);

  const searchInput = requiredElement("#music-search");
  const sortSelect = requiredElement("#music-sort");

  function renderMusicOptions(selectedId = "") {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const matches = music.filter((song) => matchesMusic(song, query));
    matches.sort((a, b) => compareMusic(a, b, sortSelect.value));

    const selectedSong = selectedId ? musicById.get(selectedId) : null;
    const visible = selectedSong && !matches.some((song) => song.id === selectedId)
      ? [selectedSong, ...matches]
      : matches;

    const options = [
      `<option value="">${escapeHtml(t("music.average"))}</option>`,
      ...visible.map((song) => `<option value="${escapeHtml(song.id)}">${escapeHtml(song.title)} · ${escapeHtml(song.singer_name)}</option>`),
    ];
    if (query && !matches.length) {
      options.push(`<option value="__no-results" disabled>${escapeHtml(labels.noResults)}</option>`);
    }
    musicSelect.innerHTML = options.join("");
    musicSelect.value = selectedId;
  }

  renderMusicOptions(store.getState?.().musicId ?? "");

  searchInput.addEventListener("input", () => renderMusicOptions(store.getState().musicId));
  sortSelect.addEventListener("change", () => renderMusicOptions(store.getState().musicId));
  musicSelect.addEventListener("change", () => store.setState({ musicId: musicSelect.value }));
  difficultySelect.addEventListener("change", () => store.setState({ difficulty: difficultySelect.value }));
  playModeSelect.addEventListener("change", () => store.setState({ playMode: playModeSelect.value }));

  return function syncMusicControls(state) {
    if (musicSelect.value !== state.musicId) renderMusicOptions(state.musicId);
    musicSelect.value = state.musicId;
    difficultySelect.value = state.difficulty;
    playModeSelect.value = state.playMode;
  };
}
