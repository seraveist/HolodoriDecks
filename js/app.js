import { loadAppData, loadManifest } from "./data.js?v=1.3.1";
import { createChartResourcesLoader, loadSelectedChart } from "./chart-data.js?v=1.3.1";
import { createStore } from "./state.js?v=1.3.1";
import { calculationSettings } from "./calculation-mode.js?v=1.3.1";
import { prepareScoreCards } from "./card-prepare.js?v=1.3.1";
import { runOptimizationAsync } from "./optimizer-client.js?v=1.3.1";
import { createOptimizationSession } from "./optimization-session.js?v=1.3.1";
import {
  getLocale,
  initI18n,
  localizeAppData,
  saveLocale,
  t,
} from "./i18n.js?v=1.3.1";
import { getThemePreference, initTheme, toggleTheme } from "./theme.js?v=1.3.1";
import { renderMemberSlots } from "./ui/member.js?v=1.3.1";
import { createCardPicker } from "./ui/modal.js?v=1.3.1";
import { mountMusicControls } from "./ui/music.js?v=1.3.1";
import { createOwnedCardsView } from "./ui/owned.js?v=1.3.1";
import { renderResult } from "./ui/result.js?v=1.3.1";
import { mountMemberOptions } from "./ui/target.js?v=1.3.1";
import { requiredElement } from "./ui/dom.js?v=1.3.1";
import { createCardDetail } from "./ui/card-detail.js?v=1.3.1";
import { createBoardEntry } from "./board-entry.js?v=1.3.1";

const APP_VERSION = "1.3.1";
const RESULT_COUNT = 5;

const EXTRA_COPY = Object.freeze({
  ko: {
    themeToDark: "다크 모드로 전환",
    themeToLight: "라이트 모드로 전환",
  },
  en: {
    themeToDark: "Switch to dark mode",
    themeToLight: "Switch to light mode",
  },
  ja: {
    themeToDark: "ダークモードに切り替え",
    themeToLight: "ライトモードに切り替え",
  },
});

const OPTIMIZER_REASON = Object.freeze({
  "계산을 완료하지 못했습니다. 다시 시도해 주세요.": {
    ko: "계산을 완료하지 못했습니다. 다시 시도해 주세요.",
    en: "The calculation could not finish. Please try again.",
    ja: "計算を完了できませんでした。もう一度お試しください。",
  },
  "리더 1장과 멤버 5장을 구성하려면 보유 카드가 최소 6장 필요합니다.": {
    ko: "리더 1장과 멤버 5장을 구성하려면 보유 카드가 최소 6장 필요합니다.",
    en: "At least 6 owned cards are required to form 1 leader and 5 members.",
    ja: "リーダー1枚とメンバー5枚を編成するには、所持カードが6枚以上必要です。",
  },
  "같은 카드를 멤버 슬롯에 두 번 고정할 수 없습니다.": {
    ko: "같은 카드를 멤버 슬롯에 두 번 고정할 수 없습니다.",
    en: "The same card cannot be locked into multiple member slots.",
    ja: "同じカードを複数のメンバー枠に固定することはできません。",
  },
  "리더/멤버 분리 조건 때문에 고정 리더와 같은 홀로멤을 멤버로 사용할 수 없습니다.": {
    ko: "‘리더를 편성에 제외’가 켜져 있어 리더와 같은 홀로멤을 멤버로 사용할 수 없습니다.",
    en: "Exclude Leader from Members is enabled, so members cannot use the leader's character.",
    ja: "リーダーをメンバーから除外する設定のため、同じホロメンをメンバーに使用できません。",
  },
  "리더로 사용할 수 있는 보유 카드가 없습니다.": {
    ko: "리더로 사용할 수 있는 보유 카드가 없습니다.",
    en: "No owned card is available for the leader slot.",
    ja: "リーダーに使用できる所持カードがありません。",
  },
  "고정 멤버가 5장을 초과했습니다.": {
    ko: "고정 멤버가 5장을 초과했습니다.",
    en: "More than 5 members are locked.",
    ja: "固定メンバーが5枚を超えています。",
  },
  "고정 프리셋과 리더 발동 조건을 함께 만족하는 편성을 찾지 못했습니다.": {
    ko: "고정 프리셋과 리더 발동 조건을 함께 만족하는 편성을 찾지 못했습니다.",
    en: "No deck satisfies both the locked preset and the leader activation conditions.",
    ja: "固定プリセットとリーダー発動条件の両方を満たす編成が見つかりませんでした。",
  },
});

function localizeOptimizerReason(reason) {
  const translated = OPTIMIZER_REASON[String(reason ?? "")];
  return translated?.[getLocale()] ?? String(reason ?? "");
}

function syncThemeToggle(button, theme = getThemePreference()) {
  const copy = EXTRA_COPY[getLocale()] ?? EXTRA_COPY.ko;
  const label = theme === "dark" ? copy.themeToLight : copy.themeToDark;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function syncExtraStaticCopy() {
  const themeToggle = document.querySelector("#theme-toggle");
  if (themeToggle) syncThemeToggle(themeToggle);
}

async function start() {
  if (document.documentElement.dataset.appVersion !== APP_VERSION) {
    throw new Error(t("app.versionMismatch"));
  }

  initTheme();
  const manifest = await loadManifest();
  const [rawData] = await Promise.all([loadAppData(manifest), initI18n(manifest)]);
  syncExtraStaticCopy();

  const themeToggle = requiredElement("#theme-toggle");
  themeToggle.addEventListener("click", () => {
    syncThemeToggle(themeToggle, toggleTheme());
  });

  const languageSelect = requiredElement("#language-select");
  languageSelect.value = getLocale();
  languageSelect.addEventListener("change", () => {
    const locale = saveLocale(languageSelect.value);
    window.location.assign(`/${locale}/${window.location.hash}`);
  });

  const memberSlots = requiredElement("#member-slots");
  memberSlots.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">◌</span><p>${t("app.loadingCards")}</p></div>`;

  const data = localizeAppData(rawData);
  const ensureChartResources = createChartResourcesLoader(manifest);
  const selectableCards = data.cards.filter((card) => [4, 5].includes(Number(card.rarity)));
  const maxLevelsById = new Map(data.cards.map((card) => [
    card.id,
    Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1)),
  ]));
  const store = createStore({
    validCardIds: new Set(selectableCards.map((card) => card.id)),
    maxLevelsById,
  });
  const deckView = requiredElement("#deck-view");
  const ownedView = requiredElement("#owned-view");
  const recommendationStatus = requiredElement("#recommendation-status");
  const optimizeButton = requiredElement("#auto-compose");
  let activeView = "deck";
  let lastRecommendation = null;
  const optimizationSession = createOptimizationSession();

  function setRecommendationStatus(message = "") {
    recommendationStatus.textContent = message;
    recommendationStatus.hidden = !message;
  }

  function recommendationSignature(state) {
    const settings = calculationSettings(state);
    const profiles = state.ownedCardIds.map((cardId) => {
      const setting = state.ownedCardSettings[cardId];
      return `${cardId}:${setting?.level ?? ""}:${setting?.potential ?? ""}`;
    }).join("|");
    return `${state.members.join("|")}::${state.lockedSlots.join("|")}::${settings.calculationMode}::${settings.musicId}::${settings.difficulty}::${settings.playMode}::${state.levelMode}::${state.separateRole}::${profiles}`;
  }

  function canCalculate(state) {
    const settings = calculationSettings(state);
    return state.ownedCardIds.length >= 6
      && (settings.calculationMode === "unit" || data.musicById.has(settings.musicId));
  }

  function syncPresetStatus(state) {
    const output = requiredElement("#preset-status");
    const leaderId = state.lockedSlots[0] ? state.members[0] : null;
    const memberIds = state.members.slice(1).filter((id, index) => state.lockedSlots[index + 1] && id);
    let warning = "";
    if (state.separateRole && leaderId) {
      const leaderCharacter = data.cardsById.get(leaderId)?.character_id;
      if (memberIds.some((cardId) => data.cardsById.get(cardId)?.character_id === leaderCharacter)) {
        warning = t("preset.conflict");
      }
    }
    output.classList.toggle("is-warning", Boolean(warning));
    output.textContent = warning;
    output.hidden = !warning;
  }

  function clearPresetSlot(index) {
    const state = store.getState();
    if (!state.members[index]) return;
    const members = [...state.members];
    const lockedSlots = [...state.lockedSlots];
    members[index] = null;
    lockedSlots[index] = false;
    lastRecommendation = null;
    store.setState({ members, lockedSlots });
    setRecommendationStatus();
  }

  async function applyRecommendation() {
    const state = store.getState();
    const settings = calculationSettings(state);
    if (state.ownedCardIds.length < 6) {
      setRecommendationStatus(t("calc.needSix"));
      return false;
    }
    if (!canCalculate(state)) return false;

    const signature = recommendationSignature(state);
    const request = optimizationSession.begin(signature);

    optimizeButton.disabled = true;
    optimizeButton.textContent = t("calc.runningTop", { count: RESULT_COUNT });
    setRecommendationStatus(t("calc.running"));
    await new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
    if (!optimizationSession.isCurrent(request)) return false;

    const preparedCards = prepareScoreCards(data.cards, data.charactersById, state.ownedCardSettings, {
      levelMode: state.levelMode,
      masterRefs: data.masterRefs,
    });
    const song = settings.musicId ? data.musicById.get(settings.musicId) : null;
    let chartResources = null;
    if (song) {
      try {
        chartResources = await ensureChartResources();
      } catch (error) {
        if (optimizationSession.finish(request)) {
          lastRecommendation = null;
          optimizeButton.textContent = t("calculate.button");
          setRecommendationStatus(localizeOptimizerReason("계산을 완료하지 못했습니다. 다시 시도해 주세요."));
          render(store.getState());
        }
        console.warn("[chart-data] Could not prepare song resources", error);
        return false;
      }
    }
    if (!optimizationSession.isCurrent(request)) return false;
    const chart = song
      ? await loadSelectedChart(chartResources, song.id, settings.difficulty, { signal: request.signal })
      : null;
    if (!optimizationSession.isCurrent(request)) return false;

    const exactMusic = song ? { ...song, _chart: chart, _scoreRules: chartResources.scoreRules } : null;
    const searchChart = chart ? { ...chart, metadata: null } : null;
    const searchMusic = song ? { ...song, _chart: searchChart, _scoreRules: chartResources.scoreRules } : null;
    const hasExactOrder = Boolean(chart?.metadata?.skills?.length);
    const ownedSet = new Set(state.ownedCardIds);
    const workerCards = new Map([...preparedCards].filter(([cardId]) => ownedSet.has(cardId)));
    const result = await runOptimizationAsync({
      preparedCards: workerCards,
      ownedCardIds: state.ownedCardIds,
      currentMembers: state.members,
      lockedSlots: state.lockedSlots,
      searchMusic,
      exactMusic,
      difficulty: settings.difficulty,
      playMode: settings.playMode,
      simulationTarget: settings.simulationTarget,
      separateRole: state.separateRole,
      hasExactOrder,
      resultCount: RESULT_COUNT,
    }, { signal: request.signal });

    // Only the request that is still current may touch button/status/result UI.
    if (!optimizationSession.finish(request)) return false;

    optimizeButton.textContent = t("calculate.button");
    const currentState = store.getState();
    optimizeButton.disabled = !canCalculate(currentState);

    if (recommendationSignature(currentState) !== signature) {
      lastRecommendation = null;
      setRecommendationStatus(t("calc.changed"));
      render(currentState);
      return false;
    }

    if (!result.ok) {
      lastRecommendation = null;
      setRecommendationStatus(localizeOptimizerReason(result.reason));
      render(currentState);
      return false;
    }

    lastRecommendation = {
      ...result,
      signature,
    };
    setRecommendationStatus();
    render(currentState);
    return true;
  }

  function viewFromHash() {
    if (/^#board(?:\/|$)/.test(window.location.hash)) return "board";
    return window.location.hash === "#owned" ? "owned" : "deck";
  }

  function showView(viewName, { updateHash = true } = {}) {
    const nextView = ["owned", "board"].includes(viewName) ? viewName : "deck";
    const changed = activeView !== nextView;
    activeView = nextView;
    if (updateHash) {
      const hash = activeView === "board" && /^#board(?:\/|$)/.test(window.location.hash)
        ? window.location.hash : `#${activeView}`;
      if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    }
    deckView.hidden = activeView !== "deck";
    ownedView.hidden = activeView !== "owned";
    ownedCardsView.setVisible(activeView === "owned");
    boardView.setVisible(activeView === "board");
    document.querySelectorAll("[data-view-tab]").forEach((tab) => {
      const active = tab.dataset.viewTab === activeView;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (changed && activeView !== "board") {
      document.querySelector(activeView === "owned" ? "#owned-card-search" : "#member-setting")?.focus({ preventScroll: true });
    }
    if (changed) window.scrollTo({ top: 0, behavior: "auto" });
  }

  const cardDetail = createCardDetail({
    cardsById: data.cardsById,
    charactersById: data.charactersById,
    store,
  });
  const picker = createCardPicker({
    cards: data.cards,
    store,
    onRequestOwned: () => showView("owned"),
    onCardDetail: cardDetail.open,
  });
  const ownedCardsView = createOwnedCardsView({
    cards: data.cards,
    charactersById: data.charactersById,
    store,
    onGoDeck: () => showView("deck"),
    onCardDetail: cardDetail.open,
    initiallyVisible: false,
  });
  const boardView = createBoardEntry({ data, store, onGoOwned: () => showView("owned") });
  const syncMemberOptions = mountMemberOptions(store);
  const syncMusicControls = mountMusicControls(data.music, store);
  requiredElement("#clear-members").addEventListener("click", () => {
    lastRecommendation = null;
    store.setState({
      members: [null, null, null, null, null, null],
      lockedSlots: [false, false, false, false, false, false],
    });
    setRecommendationStatus();
  });
  optimizeButton.addEventListener("click", () => applyRecommendation());
  document.querySelectorAll("[data-view-tab]").forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.viewTab));
  });

  function render(state) {
    const signature = recommendationSignature(state);
    if (optimizationSession.invalidateIfChanged(signature)) {
      optimizeButton.textContent = t("calculate.button");
      setRecommendationStatus(t("calc.changed"));
    }
    if (lastRecommendation && lastRecommendation.signature !== signature) {
      lastRecommendation = null;
      setRecommendationStatus(t("calc.changed"));
    }
    syncMemberOptions(state);
    syncMusicControls(state);
    syncPresetStatus(state);
    renderMemberSlots(memberSlots, data.cardsById, state, picker.open, clearPresetSlot);
    renderResult(data, state, lastRecommendation);
    ownedCardsView.render(state);
    boardView.render(state);
    optimizeButton.disabled = Boolean(optimizationSession.active) || !canCalculate(state);
    picker.refresh();
    cardDetail.refresh();
  }

  window.addEventListener("hashchange", () => showView(viewFromHash(), { updateHash: false }));
  document.querySelector(".view-tabs").addEventListener("keydown", (event) => {
    const tabs = [...document.querySelectorAll("[data-view-tab]")];
    const index = tabs.indexOf(event.target);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  });
  store.subscribe(render);
  render(store.getState());
  showView(viewFromHash(), { updateHash: false });
}

start().catch((error) => {
  console.error(error);
  const errorBox = document.querySelector("#app-error");
  const message = t("app.startFailed", { message: error.message });
  if (errorBox) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  } else {
    const fallback = document.createElement("p");
    fallback.setAttribute("role", "alert");
    fallback.textContent = message;
    document.body.append(fallback);
  }
});
