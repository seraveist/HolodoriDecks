import { t } from "../i18n.js?v=20260812.1";
import { renderLandscapeCardArt, renderCardCopy, wirePortraitFallback } from "./cards.js?v=20260812.1";

export function getSlotLabel(index) {
  return index === 0 ? t("slot.leader") : t("slot.member", { index });
}

function emptySlot(index) {
  const slot = getSlotLabel(index);
  return `
    <button class="member-slot" type="button" data-member-slot="${index}" aria-label="${t("slot.selectAria", { slot })}">
      <span class="slot-role">${slot}</span>
      <span class="slot-empty">
        <span class="slot-plus" aria-hidden="true">＋</span>
        <strong>${t("slot.select")}</strong>
        <small>${t("slot.tap")}</small>
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
  const status = locked ? t("slot.fixed") : t("slot.recommended");
  const slot = getSlotLabel(index);
  const profile = normalizeCardProfile(card, setting);
  return `
    <button class="member-slot filled ${locked ? "is-locked" : "is-recommended"}" type="button" data-member-slot="${index}" aria-label="${t("slot.changeAria", { slot, character: card.character_name, status })}">
      <span class="slot-role">${slot} · ${status}</span>
      ${renderLandscapeCardArt(card, { lazy: false })}
      ${renderCardCopy(card, "slot-card-copy", `Lv${profile.level} · ${t("card.potential")} ${profile.potential}`)}
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
