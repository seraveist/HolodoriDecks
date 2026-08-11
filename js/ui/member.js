import { renderLandscapeCardArt, renderCardCopy, wirePortraitFallback } from "./cards.js?v=20260811.19";

const SLOT_LABELS = ["리더", "멤버 1", "멤버 2", "멤버 3", "멤버 4", "멤버 5"];

function emptySlot(index) {
  return `
    <button class="member-slot" type="button" data-member-slot="${index}" aria-label="${SLOT_LABELS[index]} 카드 선택">
      <span class="slot-role">${SLOT_LABELS[index]}</span>
      <span class="slot-empty">
        <span class="slot-plus" aria-hidden="true">＋</span>
        <strong>카드 선택</strong>
        <small>슬롯을 눌러주세요</small>
      </span>
    </button>`;
}

function normalizeCardProfile(card, setting) {
  const growthLevels = card.growth?.levels ?? [];
  const maxLevel = Math.max(1, ...growthLevels.map((entry) => Number(entry.level) || 0));
  return {
    level: Math.max(1, Number(setting?.level) || maxLevel),
    potential: Math.min(5, Math.max(0, Number(setting?.potential) || 0)),
  };
}

function filledSlot(index, card, locked, setting) {
  const status = locked ? "고정" : "추천";
  const profile = normalizeCardProfile(card, setting);
  return `
    <button class="member-slot filled ${locked ? "is-locked" : "is-recommended"}" type="button" data-member-slot="${index}" aria-label="${SLOT_LABELS[index]} ${card.character_name} 카드 변경 · ${status}">
      <span class="slot-role">${SLOT_LABELS[index]} · ${status}</span>
      ${renderLandscapeCardArt(card, { lazy: false })}
      ${renderCardCopy(card, "slot-card-copy", `Lv${profile.level} · ${profile.potential}개화`)}
    </button>`;
}

export function renderMemberSlots(container, cardsById, state, onSlotClick) {
  container.innerHTML = state.members
    .map((cardId, index) => {
      const card = cardId ? cardsById.get(cardId) : null;
      const setting = card ? state.ownedCardSettings?.[card.id] : null;
      return card ? filledSlot(index, card, state.lockedSlots[index], setting) : emptySlot(index);
    })
    .join("");

  container.querySelectorAll("[data-member-slot]").forEach((button) => {
    button.addEventListener("click", () => onSlotClick(Number(button.dataset.memberSlot), button));
  });
  wirePortraitFallback(container);
}

export { SLOT_LABELS };
