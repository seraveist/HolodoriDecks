import { getLocale } from "./i18n.js?v=1.3.1";
import { BOARD_STORAGE_KEY } from "./board-state.js?v=1.3.1";

/** Tiny shell; editor code, layout and styles are loaded only on the Board tab. */
export function createBoardEntry({ data, store, onGoOwned, onGoDeck, onChange = () => {} }) {
  const labels = { ko: "멤버별 보드", en: "Member Boards", ja: "ホロメンボード" };
  const tab = document.createElement("button");
  tab.id = "board-tab";
  tab.className = "view-tab";
  tab.type = "button";
  tab.dataset.viewTab = "board";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "board-view");
  tab.setAttribute("aria-selected", "false");
  tab.tabIndex = -1;
  const label = document.createElement("span");
  label.textContent = labels[getLocale()] ?? labels.ko;
  tab.append(label);
  const tabs = document.querySelector(".view-tabs");
  tabs.classList.add("has-board-tab");
  tabs.append(tab);
  const container = document.createElement("section");
  container.id = "board-view";
  container.className = "app-view panel board-panel";
  container.setAttribute("role", "tabpanel");
  container.setAttribute("aria-labelledby", "board-tab");
  container.hidden = true;
  document.querySelector(".app-shell").append(container);
  let editor = null;
  let pending = null;
  let visible = false;
  let currentState = store.getState();
  let catalogPromise = null;
  const catalog = () => catalogPromise ??= import('./board-data.js?v=1.3.1')
    .then(module => module.loadBoardCatalog(data.manifest, getLocale()))
    .catch(error => { catalogPromise = null; throw error; });
  const saved = () => globalThis.localStorage.getItem(BOARD_STORAGE_KEY);
  window.addEventListener('storage', event => {
    if (event.key === BOARD_STORAGE_KEY || event.key === null) onChange();
  });
  async function load() {
    if (editor || pending) return pending;
    container.setAttribute("aria-busy", "true");
    container.textContent = getLocale() === "ko" ? "보드 화면을 불러오는 중…" : getLocale() === "ja" ? "ボードを読み込み中…" : "Loading boards…";
    pending = Promise.all([import("./ui/boards.js?v=1.3.1"), catalog()])
      .then(([{ createBoardsView }, loadedCatalog]) => {
      editor = createBoardsView({ container, data, store, catalog: loadedCatalog, onGoOwned, onGoDeck, onChange, locale: getLocale() });
      editor.render(currentState);
      editor.setVisible(visible);
    }).catch(error => {
      console.error("[boards]", error);
      container.textContent = getLocale() === "ko" ? "보드 화면을 불러오지 못했습니다. " : getLocale() === "ja" ? "ボードを読み込めませんでした。 " : "Could not load boards. ";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = getLocale() === "ko" ? "다시 시도" : getLocale() === "ja" ? "再試行" : "Retry";
      retry.addEventListener("click", load);
      container.append(retry);
    }).finally(() => {
      container.removeAttribute("aria-busy");
      pending = null;
    });
    return pending;
  }
  return {
    signature() { try { return saved() ?? ''; } catch { return 'board-storage-unavailable'; } },
    async accountBonuses(appState) {
      const text = saved();
      // Preserve the lazy path for users who have not configured any boards.
      if (!text) return null;
      const [{ compileBoardProfile }, loadedCatalog] = await Promise.all([import('./board-score.js?v=1.3.1'), catalog()]);
      return { boardProfile: compileBoardProfile(loadedCatalog, JSON.parse(text), {
        characters: data.characters, ownedCardIds: appState.ownedCardIds, ownedCardSettings: appState.ownedCardSettings,
      }) };
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      container.hidden = !visible;
      if (visible) load();
      editor?.setVisible(visible);
    },
    render(state) { currentState = state; editor?.render(state); },
  };
}
