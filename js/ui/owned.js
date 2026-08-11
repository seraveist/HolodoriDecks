import { compareByPower } from "../recommend.js?v=20260811.19";
import {
  attributeStyle,
  escapeHtml,
  renderLandscapeCardArt,
  renderLandscapeCardTitle,
  wirePortraitFallback,
} from "./cards.js?v=20260811.19";
import { requiredElement } from "./dom.js?v=20260811.19";

const OWNED_CARD_RARITIES = new Set([4, 5]);

function numericOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function numericReleaseOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : Number.MIN_SAFE_INTEGER;
}

export function compareByGameOrder(a, b, charactersById = new Map()) {
  return Number(b.rarity) - Number(a.rarity)
    || numericOrder(charactersById.get(a.character_id)?.order) - numericOrder(charactersById.get(b.character_id)?.order)
    || numericOrder(a.order) - numericOrder(b.order)
    || String(a.id).localeCompare(String(b.id), "ko");
}

export function compareByReleaseOrder(a, b, charactersById = new Map()) {
  return Number(b.rarity) - Number(a.rarity)
    || numericReleaseOrder(b.order) - numericReleaseOrder(a.order)
    || numericOrder(charactersById.get(a.character_id)?.order) - numericOrder(charactersById.get(b.character_id)?.order)
    || String(b.id).localeCompare(String(a.id), "ko");
}

export function createOwnedCardsExport(state) {
  return {
    format: "holodori-decksim-owned-cards",
    version: 1,
    exportedAt: new Date().toISOString(),
    ownedCards: state.ownedCardIds.map((id) => ({
      id,
      level: state.ownedCardSettings?.[id]?.level,
      potential: state.ownedCardSettings?.[id]?.potential ?? 0,
    })),
  };
}

export function normalizeOwnedCardsImport(payload, cards) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  let rows = Array.isArray(payload) ? payload : payload?.ownedCards;
  if (!Array.isArray(rows) && Array.isArray(payload?.ownedCardIds)) {
    rows = payload.ownedCardIds.map((id) => ({ id, ...payload.ownedCardSettings?.[id] }));
  }
  if (!Array.isArray(rows)) throw new Error("지원하지 않는 보유 카드 JSON 형식입니다.");
  const ownedCardIds = [];
  const ownedCardSettings = {};
  const seen = new Set();
  rows.forEach((row) => {
    const entry = typeof row === "string" ? { id: row } : row;
    const card = cardsById.get(entry?.id);
    if (!card || seen.has(card.id)) return;
    seen.add(card.id);
    const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((level) => Number(level.level) || 1));
    const level = Math.min(maxLevel, Math.max(1, Math.round(Number(entry.level) || maxLevel)));
    const potential = Math.min(5, Math.max(0, Math.round(Number(entry.potential) || 0)));
    ownedCardIds.push(card.id);
    ownedCardSettings[card.id] = { level, potential };
  });
  return { ownedCardIds, ownedCardSettings };
}

export function createOwnedCardsView({ cards, charactersById = new Map(), store, onGoDeck, onCardDetail }) {
  const displayCards = cards.filter((card) => OWNED_CARD_RARITIES.has(Number(card.rarity)));
  const list = requiredElement("#owned-card-list");
  const search = requiredElement("#owned-card-search");
  const rarity = requiredElement("#owned-rarity-filter");
  const attribute = requiredElement("#owned-attribute-filter");
  const status = requiredElement("#owned-status-filter");
  const sort = requiredElement("#owned-card-sort");
  const ownedCount = requiredElement("#owned-count");
  const visibleCount = requiredElement("#owned-visible-count");
  const tabCount = requiredElement("#owned-tab-count");

  function maxLevel(card) {
    return Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1));
  }

  function cardSetting(state, card) {
    return state.ownedCardSettings?.[card.id] ?? {
      level: maxLevel(card),
      potential: 0,
    };
  }

  function filteredCards(state) {
    const query = search.value.trim().toLocaleLowerCase("ko");
    const owned = new Set(state.ownedCardIds);
    const visible = displayCards.filter((card) => {
      const matchesQuery = !query || `${card.character_name} ${card.name}`.toLocaleLowerCase("ko").includes(query);
      const matchesRarity = rarity.value === "all" || Number(rarity.value) === Number(card.rarity);
      const matchesAttribute = attribute.value === "all" || Number(attribute.value) === Number(card.attribute);
      const matchesStatus = status.value === "all"
        || (status.value === "owned" && owned.has(card.id))
        || (status.value === "unowned" && !owned.has(card.id));
      return matchesQuery && matchesRarity && matchesAttribute && matchesStatus;
    });

    if (sort.value === "latest") {
      visible.sort((a, b) => compareByReleaseOrder(a, b, charactersById));
    } else if (sort.value === "game") {
      visible.sort((a, b) => compareByGameOrder(a, b, charactersById));
    } else if (sort.value === "power") {
      visible.sort(compareByPower);
    } else if (sort.value === "rarity") {
      visible.sort((a, b) => Number(b.rarity) - Number(a.rarity) || numericOrder(b.order) - numericOrder(a.order));
    } else if (sort.value === "character") {
      visible.sort((a, b) => a.character_name.localeCompare(b.character_name, "ko") || Number(a.order) - Number(b.order));
    } else {
      visible.sort((a, b) => compareByReleaseOrder(a, b, charactersById));
    }
    return visible;
  }

  function toggleCard(cardId) {
    store.setState((state) => {
      const owned = new Set(state.ownedCardIds);
      const ownedCardSettings = { ...state.ownedCardSettings };
      if (owned.has(cardId)) {
        owned.delete(cardId);
        delete ownedCardSettings[cardId];
      } else {
        const card = displayCards.find((row) => row.id === cardId);
        owned.add(cardId);
        ownedCardSettings[cardId] = {
          level: maxLevel(card),
          potential: 0,
        };
      }
      return { ownedCardIds: [...owned], ownedCardSettings };
    });
  }

  function updateCardSetting(cardId, patch) {
    store.setState((state) => {
      const ownedCardSettings = {
        ...state.ownedCardSettings,
        [cardId]: { ...state.ownedCardSettings[cardId], ...patch },
      };
      return { ownedCardSettings };
    });
  }

  function render(state) {
    const owned = new Set(state.ownedCardIds);
    const visible = filteredCards(state);
    const ownedDisplayCount = displayCards.reduce((countValue, card) => countValue + Number(owned.has(card.id)), 0);
    ownedCount.textContent = `${ownedDisplayCount}장 보유`;
    visibleCount.textContent = `전체 ${displayCards.length}장 중 ${visible.length}장 표시`;
    tabCount.textContent = String(ownedDisplayCount);

    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><span aria-hidden="true">⌕</span><p>조건에 맞는 카드가 없습니다.</p></div>';
      return;
    }

    list.innerHTML = visible.map((card) => {
      const isOwned = owned.has(card.id);
      const setting = cardSetting(state, card);
      return `
        <article class="owned-card${isOwned ? " is-owned" : ""}" style="${attributeStyle(card)}">
          <button class="owned-card-toggle" type="button" data-owned-card-id="${escapeHtml(card.id)}" aria-pressed="${isOwned}">
            <span class="owned-check" aria-hidden="true">${isOwned ? "✓ 보유" : "+ 등록"}</span>
            ${renderLandscapeCardArt(card, { showMeta: false })}
            <span class="landscape-card-copy">
              ${renderLandscapeCardTitle(card)}
              <span>${escapeHtml(card.name)}</span>
              ${isOwned ? `<small>Lv${setting.level} · ${setting.potential}개화</small>` : ""}
            </span>
          </button>
          <button class="card-detail-button" type="button" data-card-detail="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.character_name)} 카드 상세 정보">i</button>
          ${isOwned ? `<div class="owned-card-settings">
            <label><span>레벨</span><input type="number" min="1" max="${maxLevel(card)}" value="${setting.level}" data-owned-level="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.character_name)} 레벨"></label>
            <label><span>개화</span><select data-owned-potential="${escapeHtml(card.id)}" aria-label="${escapeHtml(card.character_name)} 개화 단계">${Array.from({ length: 6 }, (_, value) => `<option value="${value}"${value === setting.potential ? " selected" : ""}>${value}개화</option>`).join("")}</select></label>
          </div>` : ""}
        </article>`;
    }).join("");

    list.querySelectorAll("[data-owned-card-id]").forEach((button) => {
      button.addEventListener("click", () => toggleCard(button.dataset.ownedCardId));
    });
    list.querySelectorAll("[data-card-detail]").forEach((button) => {
      button.addEventListener("click", () => onCardDetail?.(button.dataset.cardDetail, button));
    });
    list.querySelectorAll("[data-owned-level]").forEach((input) => {
      input.addEventListener("change", () => updateCardSetting(input.dataset.ownedLevel, { level: Number(input.value) }));
    });
    list.querySelectorAll("[data-owned-potential]").forEach((select) => {
      select.addEventListener("change", () => updateCardSetting(select.dataset.ownedPotential, { potential: Number(select.value) }));
    });
    wirePortraitFallback(list);
  }

  [search, rarity, attribute, status, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", () => render(store.getState()));
  });
  requiredElement("#own-visible-cards").addEventListener("click", () => {
    const state = store.getState();
    const owned = new Set(state.ownedCardIds);
    const ownedCardSettings = { ...state.ownedCardSettings };
    filteredCards(state).forEach((card) => {
      owned.add(card.id);
      ownedCardSettings[card.id] ??= {
        level: maxLevel(card),
        potential: 0,
      };
    });
    store.setState({ ownedCardIds: [...owned], ownedCardSettings });
  });
  requiredElement("#clear-owned-cards").addEventListener("click", () => {
    if (!window.confirm("보유 카드 목록과 현재 편성을 모두 비울까요?")) return;
    store.setState({ ownedCardIds: [] });
  });
  const importInput = requiredElement("#owned-import-file");
  requiredElement("#export-owned-cards").addEventListener("click", () => {
    const state = store.getState();
    if (!state.ownedCardIds.length) {
      window.alert("내보낼 보유 카드가 없습니다.");
      return;
    }
    const blob = new Blob([`${JSON.stringify(createOwnedCardsExport(state), null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `holodori-owned-cards-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  requiredElement("#import-owned-cards").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const imported = normalizeOwnedCardsImport(JSON.parse(await file.text()), displayCards);
      if (!imported.ownedCardIds.length) throw new Error("가져올 수 있는 ★4·★5 카드가 없습니다.");
      if (store.getState().ownedCardIds.length
        && !window.confirm(`가져온 ${imported.ownedCardIds.length}장의 카드로 현재 보유 목록을 교체할까요?`)) return;
      store.setState(imported);
      window.alert(`${imported.ownedCardIds.length}장의 보유 카드를 가져왔습니다.`);
    } catch (error) {
      window.alert(`보유 카드 JSON을 가져오지 못했습니다. (${error.message})`);
    }
  });
  requiredElement("#owned-go-deck").addEventListener("click", onGoDeck);

  return { render };
}
