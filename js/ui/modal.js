import {
  attributeStyle,
  escapeHtml,
  renderLandscapeCardArt,
  renderLandscapeCardTitle,
  wirePortraitFallback,
} from "./cards.js?v=20260811.19";
import { SLOT_LABELS } from "./member.js?v=20260811.19";
import { compareByPower } from "../recommend.js?v=20260811.19";
import { requiredElement } from "./dom.js?v=20260811.19";

export function compareByRarityThenDataOrder(a, b) {
  return Number(b.rarity) - Number(a.rarity)
    || Number(a.order) - Number(b.order)
    || String(a.id).localeCompare(String(b.id), "ko");
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
    const query = search.value.trim().toLocaleLowerCase("ko");
    const result = cards.filter((card) => {
      if (!ownedIds.has(card.id)) return false;
      if (state.separateRole && activeSlot === 0 && fixedMemberCharacters.has(card.character_id)) return false;
      if (state.separateRole && activeSlot > 0 && leaderCard?.character_id === card.character_id) return false;
      const matchesQuery = !query || `${card.character_name} ${card.name}`.toLocaleLowerCase("ko").includes(query);
      const matchesRarity = rarity.value === "all" || Number(rarity.value) === Number(card.rarity);
      const matchesAttribute = attribute.value === "all" || Number(attribute.value) === Number(card.attribute);
      return matchesQuery && matchesRarity && matchesAttribute;
    });

    if (sort.value === "power") {
      result.sort(compareByPower);
    } else if (sort.value === "rarity") {
      result.sort(compareByRarityThenDataOrder);
    } else if (sort.value === "character") {
      result.sort((a, b) => a.character_name.localeCompare(b.character_name, "ko") || Number(a.order) - Number(b.order));
    } else if (sort.value === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name, "ko") || Number(a.order) - Number(b.order));
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
    count.textContent = `보유 카드 ${state.ownedCardIds.length}장 · ${visible.length}장 표시`;
    clearSlot.disabled = !currentId;

    if (!visible.length) {
      const hasOwnedCards = state.ownedCardIds.length > 0;
      list.innerHTML = `
        <div class="empty-state picker-empty">
          <span aria-hidden="true">${hasOwnedCards ? "⌕" : "◇"}</span>
          <p>${hasOwnedCards ? "조건에 맞는 보유 카드가 없습니다." : "먼저 내 보유 카드 리스트를 등록해 주세요."}</p>
          ${hasOwnedCards ? "" : '<button class="primary-button" type="button" data-request-owned>보유 카드 등록하기</button>'}
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
      const setting = state.ownedCardSettings?.[card.id];
      return `
        <article class="picker-card${isCurrent ? " is-current" : ""}${isUsed ? " is-unavailable" : ""}" style="${attributeStyle(card)}">
          <button class="picker-card-select" type="button" data-card-id="${escapeHtml(card.id)}"${isUsed ? " disabled" : ""}>
          ${isUsed ? '<span class="used-chip">편성 중</span>' : ""}
          ${renderLandscapeCardArt(card, { showMeta: false })}
          <span class="landscape-card-copy picker-card-copy">
            ${renderLandscapeCardTitle(card)}
            <span>${escapeHtml(card.name)}</span>
            <small>Lv${setting.level} · ${setting.potential}개화</small>
          </span>
          </button>
          <button class="card-detail-button" type="button" data-card-detail="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.character_name)} 카드 상세 정보">i</button>
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
    requiredElement("#card-modal-title").textContent = `${SLOT_LABELS[slotIndex]} 카드 선택`;
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
