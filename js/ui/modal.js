import {
  attributeStyle,
  escapeHtml,
  renderLandscapeCardArt,
  renderLandscapeCardTitle,
  wirePortraitFallback,
} from "./cards.js?v=20260813.2";
import { getSlotLabel } from "./member.js?v=20260812.1";
import { compareByPower } from "../recommend.js?v=20260811.19";
import { localeCompare, t } from "../i18n.js?v=20260812.1";
import { requiredElement } from "./dom.js?v=20260812.1";

export function compareByRarityThenDataOrder(a, b) {
  return Number(b.rarity) - Number(a.rarity)
    || Number(a.order) - Number(b.order)
    || localeCompare(a.id, b.id);
}

export function createCardPicker({ cards, store, onRequestOwned, onCardDetail }) {
  const modal = requiredElement("#card-modal");
  const dialog = requiredElement(".modal-dialog", modal);
  const search = requiredElement("#card-search");
  const rarity = requiredElement("#rarity-filter");
  const attribute = requiredElement("#attribute-filter");
  const sort = requiredElement("#card-sort");
  const list = requiredElement("#card-list");
  const count = requiredElement("#card-count");
  const slotLabel = requiredElement("#card-modal-slot");
  const clearSlot = requiredElement("#clear-slot");
  let activeSlot = null;
  let returnFocus = null;

  function filteredCards() {
    const state = store.getState();
    const ownedIds = new Set(state.ownedCardIds);
    const leaderCard = state.members[0] ? cards.find((card) => card.id === state.members[0]) : null;
    const fixedMemberCharacters = new Set(state.members.slice(1).map((id) => (
      id ? cards.find((card) => card.id === id)?.character_id : null
    )).filter(Boolean));
    const query = search.value.trim().toLocaleLowerCase();
    const result = cards.filter((card) => {
      if (!ownedIds.has(card.id)) return false;
      if (state.separateRole && activeSlot === 0 && fixedMemberCharacters.has(card.character_id)) return false;
      if (state.separateRole && activeSlot > 0 && leaderCard?.character_id === card.character_id) return false;
      const matchesQuery = !query || `${card.character_name} ${card.name}`.toLocaleLowerCase().includes(query);
      const matchesRarity = rarity.value === "all" || Number(rarity.value) === Number(card.rarity);
      const matchesAttribute = attribute.value === "all" || Number(attribute.value) === Number(card.attribute);
      return matchesQuery && matchesRarity && matchesAttribute;
    });

    if (sort.value === "power") {
      result.sort(compareByPower);
    } else if (sort.value === "rarity") {
      result.sort(compareByRarityThenDataOrder);
    } else if (sort.value === "character") {
      result.sort((a, b) => localeCompare(a.character_name, b.character_name) || Number(a.order) - Number(b.order));
    } else if (sort.value === "name") {
      result.sort((a, b) => localeCompare(a.name, b.name) || Number(a.order) - Number(b.order));
    } else {
      result.sort(compareByRarityThenDataOrder);
    }
    return result;
  }

  function render() {
    if (activeSlot === null) return;
    const state = store.getState();
    const currentId = state.members[activeSlot];
    const usedIds = new Set(state.members.filter(Boolean));
    const visible = filteredCards();
    count.textContent = t("picker.ownedCount", { owned: state.ownedCardIds.length, visible: visible.length });
    clearSlot.disabled = !currentId;

    if (!visible.length) {
      const hasOwnedCards = state.ownedCardIds.length > 0;
      list.innerHTML = `
        <div class="empty-state picker-empty">
          <span aria-hidden="true">${hasOwnedCards ? "⌕" : "◇"}</span>
          <p>${hasOwnedCards ? t("picker.noMatch") : t("picker.registerFirst")}</p>
          ${hasOwnedCards ? "" : `<button class="primary-button" type="button" data-request-owned>${t("picker.register")}</button>`}
        </div>`;
      list.querySelector("[data-request-owned]")?.addEventListener("click", () => {
        close();
        onRequestOwned();
      });
      return;
    }

    list.innerHTML = visible.map((card) => {
      const isCurrent = currentId === card.id;
      const isUsed = usedIds.has(card.id) && !isCurrent;
      const setting = state.ownedCardSettings?.[card.id] ?? {};
      return `
        <article class="picker-card${isCurrent ? " is-current" : ""}${isUsed ? " is-unavailable" : ""}" style="${attributeStyle(card)}">
          <button class="picker-card-select" type="button" data-card-id="${escapeHtml(card.id)}"${isUsed ? " disabled" : ""}>
          ${isUsed ? `<span class="used-chip">${t("picker.inDeck")}</span>` : ""}
          ${renderLandscapeCardArt(card, { showMeta: false })}
          <span class="landscape-card-copy picker-card-copy">
            ${renderLandscapeCardTitle(card)}
            <span class="card-copy-name">${escapeHtml(card.name)}</span>
            <small class="card-copy-meta">Lv${Number(setting.level) || "-"} · ${t("card.potential")} ${Number(setting.potential) || 0}</small>
          </span>
          </button>
          <button class="card-detail-button" type="button" data-card-detail="${escapeHtml(card.id)}" aria-label="${escapeHtml(t("card.detailsAria", { character: card.character_name }))}">i</button>
        </article>`;
    }).join("");

    list.querySelectorAll("[data-card-id]").forEach((button) => {
      button.addEventListener("click", () => {
        store.setState((stateValue) => {
          const members = [...stateValue.members];
          const lockedSlots = [...stateValue.lockedSlots];
          members[activeSlot] = button.dataset.cardId;
          lockedSlots[activeSlot] = true;
          return { members, lockedSlots };
        });
        close();
      });
    });
    list.querySelectorAll("[data-card-detail]").forEach((button) => {
      button.addEventListener("click", () => onCardDetail?.(button.dataset.cardDetail, button));
    });
    wirePortraitFallback(list);
  }

  function open(slotIndex, trigger) {
    activeSlot = slotIndex;
    returnFocus = trigger;
    slotLabel.textContent = slotIndex === 0 ? "LEADER SLOT" : `MEMBER ${String(slotIndex).padStart(2, "0")}`;
    requiredElement("#card-modal-title").textContent = t("picker.modalTitle", { slot: getSlotLabel(slotIndex) });
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    render();
    window.setTimeout(() => search.focus(), 0);
  }

  function close() {
    if (!modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    activeSlot = null;
    returnFocus?.focus();
  }

  [search, rarity, attribute, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", render);
  });
  modal.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", close));
  clearSlot.addEventListener("click", () => {
    if (activeSlot === null) return;
    store.setState((stateValue) => {
      const members = [...stateValue.members];
      const lockedSlots = [...stateValue.lockedSlots];
      members[activeSlot] = null;
      lockedSlots[activeSlot] = false;
      return { members, lockedSlots };
    });
    close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Tab" && modal.classList.contains("is-open")) {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), input, select')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  return {
    open,
    close,
    refresh() {
      if (modal.classList.contains("is-open")) render();
    },
  };
}
