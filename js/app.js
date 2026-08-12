import { loadAppData, loadManifest } from "./data.js?v=20260812.2";
import { loadChartResources, loadSelectedChart } from "./chart-data.js?v=20260812.4";
import { createStore } from "./state.js?v=20260812.2";
import { optimizeOwnedDeck } from "./recommend.js?v=20260812.4";
import { optimizeRecommendationOrders } from "./order.js?v=20260812.4";
import { prepareScoreCards } from "./score.js?v=20260812.4";
import {
  getLocale,
  initI18n,
  localizeAppData,
  saveLocale,
  t,
} from "./i18n.js?v=20260812.1";
import { getThemePreference, initTheme, toggleTheme } from "./theme.js?v=20260812.3";
import { renderMemberSlots } from "./ui/member.js?v=20260812.2";
import { createCardPicker } from "./ui/modal.js?v=20260812.1";
import { mountMusicControls } from "./ui/music.js?v=20260812.1";
import { createOwnedCardsView } from "./ui/owned.js?v=20260812.1";
import { renderResult } from "./ui/result.js?v=20260812.4";
import { applySimulationTargetPresentation } from "./ui/result-target.js?v=20260812.2";
import { mountMemberOptions } from "./ui/target.js?v=20260812.1";
import { requiredElement } from "./ui/dom.js?v=20260812.1";
import { createCardDetail } from "./ui/card-detail.js?v=20260812.1";

const APP_VERSION = "20260812.3";
const RESULT_COUNT = 5;

const EXTRA_COPY = Object.freeze({
  ko: {
    targetScore: "최고 유닛 스코어",
    targetPotential: "최고 잠재 스코어",
    themeToDark: "다크 모드로 전환",
    themeToLight: "라이트 모드로 전환",
  },
  en: {
    targetScore: "Highest Unit Score",
    targetPotential: "Highest Potential Score",
    themeToDark: "Switch to dark mode",
    themeToLight: "Switch to light mode",
  },
  ja: {
    targetScore: "最高ユニットスコア",
    targetPotential: "最高潜在スコア",
    themeToDark: "ダークモードに切り替え",
    themeToLight: "ライトモードに切り替え",
  },
});

const OPTIMIZER_REASON = Object.freeze({
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
    ko: "리더/멤버 분리 조건 때문에 고정 리더와 같은 홀로멤을 멤버로 사용할 수 없습니다.",
    en: "With Separate Leader/Member enabled, a member cannot use the same character as the locked leader.",
    ja: "リーダー/メンバー分離が有効なため、固定リーダーと同じホロメンをメンバーに使用できません。",
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
  const copy = EXTRA_COPY[getLocale()] ?? EXTRA_COPY.ko;
  const target = document.querySelector("#simulation-target");
  const scoreOption = target?.querySelector('option[value="score"]');
  const potentialOption = target?.querySelector('option[value="potential"]');
  if (scoreOption) scoreOption.textContent = copy.targetScore;
  if (potentialOption) potentialOption.textContent = copy.targetPotential;

  const themeToggle = document.querySelector("#theme-toggle");
  if (themeToggle) syncThemeToggle(themeToggle);
}

async function start() {
  if (document.documentElement.dataset.appVersion !== APP_VERSION) {
    throw new Error(t("app.versionMismatch"));
  }

  initTheme();
  const manifest = await loadManifest();
  await initI18n(manifest);
  syncExtraStaticCopy();

  const themeToggle = requiredElement("#theme-toggle");
  themeToggle.addEventListener("click", () => {
    syncThemeToggle(themeToggle, toggleTheme());
  });

  const languageSelect = requiredElement("#language-select");
  languageSelect.value = getLocale();
  languageSelect.addEventListener("change", () => {
    saveLocale(languageSelect.value);
    window.location.reload();
  });

  const memberSlots = requiredElement("#member-slots");
  const resultContainer = requiredElement("#recommendation-results");
  memberSlots.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">◌</span><p>${t("app.loadingCards")}</p></div>`;

  const data = localizeAppData(await loadAppData(manifest));
  const chartResources = await loadChartResources(manifest);
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

  function setRecommendationStatus(message = "") {
    recommendationStatus.textContent = message;
    recommendationStatus.hidden = !message;
  }

  function recommendationSignature(state) {
    const profiles = state.ownedCardIds.map((cardId) => {
      const setting = state.ownedCardSettings[cardId];
      return `${cardId}:${setting?.level ?? ""}:${setting?.potential ?? ""}`;
    }).join("|");
    return `${state.members.join("|")}::${state.lockedSlots.join("|")}::${state.musicId}::${state.difficulty}::${state.playMode}::${state.simulationTarget}::${state.levelMode}::${state.separateRole}::${profiles}`;
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
    if (state.ownedCardIds.length < 6) {
      setRecommendationStatus(t("calc.needSix"));
      return false;
    }
    optimizeButton.disabled = true;
    optimizeButton.textContent = t("calc.runningTop", { count: RESULT_COUNT });
    setRecommendationStatus(t("calc.running"));
    await new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));

    const preparedCards = prepareScoreCards(data.cards, data.charactersById, state.ownedCardSettings, {
    levelMode: state.levelMode,
  });
  const song = state.musicId ? data.musicById.get(state.musicId) : null;
  const chart = song ? await loadSelectedChart(chartResources, song.id, state.difficulty) : null;
  const exactMusic = song ? { ...song, _chart: chart, _scoreRules: chartResources.scoreRules } : null;
  const searchChart = chart ? { ...chart, metadata: null } : null;
  const searchMusic = song ? { ...song, _chart: searchChart, _scoreRules: chartResources.scoreRules } : null;
  const hasExactOrder = Boolean(chart?.metadata?.skills?.length);
  let result = optimizeOwnedDeck({
    preparedCards,
    ownedCardIds: state.ownedCardIds,
    currentMembers: state.members,
    lockedSlots: state.lockedSlots,
    music: searchMusic,
    difficulty: state.difficulty,
    playMode: state.playMode,
    simulationTarget: state.simulationTarget,
    separateRole: state.separateRole,
    resultCount: hasExactOrder ? Math.min(10, RESULT_COUNT * 2) : RESULT_COUNT,
  });
  if (result.ok) {
    result = optimizeRecommendationOrders({
      recommendation: result,
      preparedCards,
      currentMembers: state.members,
      lockedSlots: state.lockedSlots,
      music: exactMusic,
      difficulty: state.difficulty,
      playMode: state.playMode,
      simulationTarget: state.simulationTarget,
      separateRole: state.separateRole,
      resultCount: RESULT_COUNT,
    });
  }

    optimizeButton.textContent = t("calculate.button");
    optimizeButton.disabled = store.getState().ownedCardIds.length < 6;

    if (!result.ok) {
      lastRecommendation = null;
      setRecommendationStatus(localizeOptimizerReason(result.reason));
      render(store.getState());
      return false;
    }

    lastRecommendation = {
      ...result,
      signature: recommendationSignature(state),
    };
    setRecommendationStatus();
    render(state);
    return true;
  }

  function showView(viewName) {
    activeView = viewName === "owned" ? "owned" : "deck";
    const showOwned = activeView === "owned";
    deckView.hidden = showOwned;
    ownedView.hidden = !showOwned;
    document.querySelectorAll("[data-view-tab]").forEach((tab) => {
      const active = tab.dataset.viewTab === activeView;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelector(showOwned ? "#owned-card-search" : "#member-setting")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  });
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
    if (lastRecommendation && lastRecommendation.signature !== recommendationSignature(state)) {
      lastRecommendation = null;
      setRecommendationStatus(t("calc.changed"));
    }
    syncMemberOptions(state);
    syncMusicControls(state);
    syncPresetStatus(state);
    renderMemberSlots(memberSlots, data.cardsById, state, picker.open, clearPresetSlot);
    renderResult(data, state, lastRecommendation);
    applySimulationTargetPresentation(resultContainer, state, lastRecommendation);
    ownedCardsView.render(state);
    optimizeButton.disabled = state.ownedCardIds.length < 6;
    picker.refresh();
    cardDetail.refresh();
  }

  store.subscribe(render);
  render(store.getState());
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
