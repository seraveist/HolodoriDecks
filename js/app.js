import { loadAppData } from "./data.js?v=20260812.20";
import { createStore } from "./state.js?v=20260812.20";
import { optimizeOwnedDeck } from "./recommend.js?v=20260812.20";
import { prepareScoreCards } from "./score.js?v=20260812.20";
import { renderMemberSlots } from "./ui/member.js?v=20260812.20";
import { createCardPicker } from "./ui/modal.js?v=20260812.20";
import { mountMusicControls } from "./ui/music.js?v=20260812.20";
import { createOwnedCardsView } from "./ui/owned.js?v=20260812.20";
import { renderResult } from "./ui/result.js?v=20260812.20";
import { mountMemberOptions } from "./ui/target.js?v=20260812.20";
import { requiredElement } from "./ui/dom.js?v=20260812.20";
import { createCardDetail } from "./ui/card-detail.js?v=20260812.20";

const APP_VERSION = "20260812.20";
const RESULT_COUNT = 5;

async function start() {
  if (document.documentElement.dataset.appVersion !== APP_VERSION) {
    throw new Error("HTML과 JavaScript 버전이 일치하지 않습니다. 새 ZIP을 빈 폴더에 압축 해제한 뒤 다시 실행해 주세요.");
  }
  const memberSlots = requiredElement("#member-slots");
  memberSlots.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span aria-hidden="true">◌</span><p>카드 데이터를 불러오는 중입니다.</p></div>';

  const data = await loadAppData();
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
        warning = "리더/멤버 분리 조건과 충돌하는 고정 카드가 있습니다.";
      }
    }
    output.classList.toggle("is-warning", Boolean(warning));
    output.textContent = warning;
    output.hidden = !warning;
  }

  async function applyRecommendation() {
    const state = store.getState();
    if (state.ownedCardIds.length < 6) {
      setRecommendationStatus("점수 조합을 계산하려면 보유 카드를 최소 6장 등록해 주세요.");
      return false;
    }
    optimizeButton.disabled = true;
    optimizeButton.textContent = `TOP ${RESULT_COUNT} 계산 중…`;
    setRecommendationStatus("계산 중…");
    await new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));

    const preparedCards = prepareScoreCards(data.cards, data.charactersById, state.ownedCardSettings, {
      levelMode: state.levelMode,
    });
    const result = optimizeOwnedDeck({
      preparedCards,
      ownedCardIds: state.ownedCardIds,
      currentMembers: state.members,
      lockedSlots: state.lockedSlots,
      music: state.musicId ? data.musicById.get(state.musicId) : null,
      difficulty: state.difficulty,
      playMode: state.playMode,
      simulationTarget: state.simulationTarget,
      separateRole: state.separateRole,
      resultCount: RESULT_COUNT,
    });
    optimizeButton.textContent = "추천 편성 계산";
    optimizeButton.disabled = store.getState().ownedCardIds.length < 6;

    if (!result.ok) {
      lastRecommendation = null;
      setRecommendationStatus(result.reason);
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
      setRecommendationStatus("조건이 변경되었습니다. 추천 편성을 다시 계산해 주세요.");
    }
    syncMemberOptions(state);
    syncMusicControls(state);
    syncPresetStatus(state);
    renderMemberSlots(memberSlots, data.cardsById, state, picker.open);
    renderResult(data, state, lastRecommendation);
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
  const message = `앱을 시작하지 못했습니다. 새 ZIP을 빈 폴더에 압축 해제하고 로컬 웹 서버를 다시 시작해 주세요. (${error.message})`;
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
