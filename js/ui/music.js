import { getLocale, localeCompare, t } from "../i18n.js?v=20260812.1";
import { escapeHtml } from "./cards.js?v=20260813.2";
import { requiredElement } from "./dom.js?v=20260812.1";

const MUSIC_COPY = Object.freeze({
  ko: {
    placeholder: "곡명, 홀로멤 또는 Music ID 검색",
    toggleAria: "악곡 목록 열기",
    noResults: "검색 결과가 없습니다.",
    genericLabel: "범용 유닛 평가",
  },
  en: {
    placeholder: "Search title, talent, or Music ID",
    toggleAria: "Open song list",
    noResults: "No matching songs.",
    genericLabel: "Generic Unit Evaluation",
  },
  ja: {
    placeholder: "曲名、ホロメン、Music IDで検索",
    toggleAria: "楽曲一覧を開く",
    noResults: "該当する楽曲がありません。",
    genericLabel: "汎用ユニット評価",
  },
});

const ROMANIZED_COLLATOR = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

function copy() {
  return MUSIC_COPY[getLocale()] ?? MUSIC_COPY.ko;
}

function katakanaToHiragana(value) {
  return [...value].map((character) => {
    const code = character.codePointAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 0x60);
    return character;
  }).join("");
}

export function normalizeMusicSearch(value) {
  const normalized = katakanaToHiragana(String(value ?? "").normalize("NFKC").toLocaleLowerCase());
  return normalized.replace(/[^\p{L}\p{N}]+/gu, "");
}

function searchAliases(song) {
  return Array.isArray(song.search?.aliases) ? song.search.aliases : [];
}

function displaySong(song) {
  return song.singer_name ? `${song.title} · ${song.singer_name}` : song.title;
}

function songSortKey(song) {
  return String(song.search?.sort_key || song.title || song.id || "");
}

export function compareMusicAlphabetical(left, right) {
  return ROMANIZED_COLLATOR.compare(songSortKey(left), songSortKey(right))
    || ROMANIZED_COLLATOR.compare(left.title || "", right.title || "")
    || ROMANIZED_COLLATOR.compare(left.id || "", right.id || "");
}

export function musicMatchesQuery(song, query) {
  const normalizedQuery = normalizeMusicSearch(query);
  if (!normalizedQuery) return true;
  const corpus = [song.id, song.title, song.singer_name, displaySong(song), ...searchAliases(song)];
  return corpus.some((value) => normalizeMusicSearch(value).includes(normalizedQuery));
}

function musicExactlyMatches(song, query) {
  const normalizedQuery = normalizeMusicSearch(query);
  if (!normalizedQuery) return false;
  const corpus = [song.id, song.title, displaySong(song), ...searchAliases(song)];
  return corpus.some((value) => normalizeMusicSearch(value) === normalizedQuery);
}

function mountComboboxField() {
  const nativeSelect = requiredElement("#music-select");
  const field = nativeSelect.closest(".field");
  if (!field) throw new Error("#music-select field is missing");
  const fieldLabel = field.querySelector(":scope > span")?.textContent?.trim() || t("music.name");

  const replacement = document.createElement("div");
  replacement.className = `${field.className} music-combobox-field`;
  replacement.innerHTML = `
    <span id="music-combobox-label">${escapeHtml(fieldLabel)}</span>
    <div class="music-combobox">
      <div class="music-combobox-control">
        <input id="music-search-input" class="music-combobox-input" type="search" role="combobox" aria-labelledby="music-combobox-label" aria-autocomplete="list" aria-controls="music-options" aria-expanded="false" autocomplete="off">
        <button id="music-combobox-toggle" class="music-combobox-toggle" type="button"></button>
      </div>
      <div id="music-options" class="music-combobox-options" role="listbox" hidden></div>
    </div>`;
  field.replaceWith(replacement);
  nativeSelect.hidden = true;
  nativeSelect.tabIndex = -1;
  nativeSelect.setAttribute("aria-hidden", "true");
  replacement.appendChild(nativeSelect);

  return {
    nativeSelect,
    input: requiredElement("#music-search-input"),
    toggle: requiredElement("#music-combobox-toggle"),
    list: requiredElement("#music-options"),
    combobox: replacement.querySelector(".music-combobox"),
  };
}

export function mountMusicControls(music, store) {
  const { nativeSelect, input, toggle, list, combobox } = mountComboboxField();
  const difficultySelect = requiredElement("#difficulty-select");
  const playModeSelect = requiredElement("#play-mode");
  const musicById = new Map(music.map((song) => [song.id, song]));
  const sortedMusic = [...music].sort(compareMusicAlphabetical);
  const labels = copy();
  const averageAliases = [
    labels.genericLabel,
    t("music.average"),
    "전체 평균",
    "범용 유닛 평가",
    "average",
    "all average",
    "generic unit evaluation",
    "全体平均",
    "汎用ユニット評価",
  ];
  let visibleItems = [];
  let activeIndex = -1;

  input.placeholder = labels.placeholder;
  toggle.setAttribute("aria-label", labels.toggleAria);
  nativeSelect.innerHTML = [
    `<option value="">${escapeHtml(labels.genericLabel)}</option>`,
    ...sortedMusic.map((song) => `<option value="${escapeHtml(song.id)}">${escapeHtml(displaySong(song))}</option>`),
  ].join("");

  function selectedLabel(musicId) {
    const song = musicId ? musicById.get(musicId) : null;
    return song ? displaySong(song) : copy().genericLabel;
  }

  function setInputFromState(musicId) {
    const id = musicId || "";
    input.dataset.selectedId = id;
    input.value = selectedLabel(id);
    nativeSelect.value = id;
  }

  function averageMatches(query) {
    const normalizedQuery = normalizeMusicSearch(query);
    return !normalizedQuery || averageAliases.some((alias) => normalizeMusicSearch(alias).includes(normalizedQuery));
  }

  function buildVisibleItems(query) {
    const items = [];
    if (averageMatches(query)) items.push({ id: "", song: null, average: true });
    for (const song of sortedMusic) {
      if (musicMatchesQuery(song, query)) items.push({ id: song.id, song, average: false });
    }
    return items;
  }

  function syncActiveOption() {
    const options = [...list.querySelectorAll("[data-music-option-index]")];
    options.forEach((option, index) => option.classList.toggle("is-active", index === activeIndex));
    const active = options[activeIndex];
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderOptions(query = "") {
    visibleItems = buildVisibleItems(query);
    const selectedId = store.getState().musicId || "";
    if (!visibleItems.length) {
      list.innerHTML = `<div class="music-combobox-empty">${escapeHtml(labels.noResults)}</div>`;
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    list.innerHTML = visibleItems.map((item, index) => {
      if (item.average) {
        return `<button id="music-option-${index}" class="music-combobox-option is-average" type="button" role="option" data-music-option-index="${index}" aria-selected="${selectedId === ""}"><strong>${escapeHtml(copy().genericLabel)}</strong></button>`;
      }
      return `<button id="music-option-${index}" class="music-combobox-option" type="button" role="option" data-music-option-index="${index}" aria-selected="${selectedId === item.id}"><strong>${escapeHtml(item.song.title)}</strong><small>${escapeHtml(item.song.singer_name || item.song.id)}</small></button>`;
    }).join("");
    if (activeIndex >= visibleItems.length) activeIndex = visibleItems.length - 1;
    syncActiveOption();
  }

  function openList({ resetActive = true } = {}) {
    if (resetActive) activeIndex = -1;
    renderOptions(input.value === selectedLabel(store.getState().musicId || "") ? "" : input.value);
    list.hidden = false;
    combobox?.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }

  function closeList() {
    list.hidden = true;
    combobox?.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  }

  function selectMusicId(musicId) {
    const id = musicId || "";
    store.setState({ musicId: id });
    setInputFromState(id);
    closeList();
  }

  function selectVisibleItem(index) {
    const item = visibleItems[index];
    if (!item) return false;
    selectMusicId(item.id);
    return true;
  }

  function revertToSelection() {
    setInputFromState(store.getState().musicId || "");
  }

  function commitInput() {
    const raw = input.value.trim();
    if (!raw) {
      selectMusicId("");
      return;
    }

    const normalizedRaw = normalizeMusicSearch(raw);
    const averageExact = averageAliases.some((alias) => normalizeMusicSearch(alias) === normalizedRaw);
    if (averageExact) {
      selectMusicId("");
      return;
    }

    const matches = sortedMusic.filter((song) => musicMatchesQuery(song, raw));
    const exact = matches.filter((song) => musicExactlyMatches(song, raw));
    if (exact.length === 1) {
      selectMusicId(exact[0].id);
      return;
    }
    if (matches.length === 1) {
      selectMusicId(matches[0].id);
      return;
    }
    revertToSelection();
    closeList();
  }

  setInputFromState(store.getState?.().musicId || "");

  input.addEventListener("focus", () => {
    input.select();
    openList();
  });
  input.addEventListener("input", () => openList());
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) openList({ resetActive: false });
      if (!visibleItems.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = activeIndex < 0
        ? (direction > 0 ? 0 : visibleItems.length - 1)
        : (activeIndex + direction + visibleItems.length) % visibleItems.length;
      syncActiveOption();
      return;
    }
    if (event.key === "Enter") {
      if (!list.hidden && activeIndex >= 0) {
        event.preventDefault();
        selectVisibleItem(activeIndex);
      } else {
        commitInput();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      revertToSelection();
      closeList();
    }
  });
  input.addEventListener("blur", () => window.setTimeout(() => {
    if (!combobox?.contains(document.activeElement)) commitInput();
  }, 0));

  toggle.addEventListener("pointerdown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    if (list.hidden) {
      input.focus();
      openList();
    } else {
      closeList();
    }
  });

  list.addEventListener("pointerdown", (event) => {
    const option = event.target.closest("[data-music-option-index]");
    if (!option) return;
    event.preventDefault();
    selectVisibleItem(Number(option.dataset.musicOptionIndex));
  });

  document.addEventListener("pointerdown", (event) => {
    if (!combobox?.contains(event.target)) closeList();
  });

  nativeSelect.addEventListener("change", () => selectMusicId(nativeSelect.value));
  difficultySelect.addEventListener("change", () => store.setState({ difficulty: difficultySelect.value }));
  playModeSelect.addEventListener("change", () => store.setState({ playMode: playModeSelect.value }));

  return function syncMusicControls(state) {
    const selectedId = state.musicId || "";
    if (input.dataset.selectedId !== selectedId) setInputFromState(selectedId);
    nativeSelect.value = selectedId;
    difficultySelect.value = state.difficulty;
    playModeSelect.value = state.playMode;
    const songSelected = Boolean(selectedId);
    difficultySelect.disabled = !songSelected;
    playModeSelect.disabled = !songSelected;
  };
}
