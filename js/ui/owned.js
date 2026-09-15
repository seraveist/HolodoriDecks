import { compareByPower } from "../recommend.js?v=1.3.1";
import { getLocale, localeCompare, t } from "../i18n.js?v=1.3.1";
import {
  attributeStyle,
  escapeHtml,
  renderLandscapeCardArt,
  renderLandscapeCardTitle,
  wirePortraitFallback,
} from "./cards.js?v=1.3.1";
import { requiredElement } from "./dom.js?v=1.3.1";

const OWNED_CARD_RARITIES = new Set([4, 5]);
const LOCAL_COPY = Object.freeze({
  ko: {
    badFormat: "지원하지 않는 보유 카드 JSON 형식입니다.",
    visibleOf: (total, visible) => `전체 ${total}장 중 ${visible}장 표시`,
    ownedChip: "✓ 보유",
    registerChip: "+ 등록",
    levelAria: (name) => `${name} 레벨`,
    potentialAria: (name) => `${name} 개화 단계`,
    potentialOption: (value) => `${value}개화`,
    clearConfirm: "보유 카드 목록과 현재 편성을 모두 비울까요?",
    nothingToExport: "내보낼 보유 카드가 없습니다.",
    noImportable: "가져올 수 있는 ★4·★5 카드가 없습니다.",
    replaceConfirm: (count) => `가져온 ${count}장의 카드로 현재 보유 목록을 교체할까요?`,
    imported: (count) => `${count}장의 보유 카드를 가져왔습니다.`,
    importFailed: (message) => `보유 카드 JSON을 가져오지 못했습니다. (${message})`,
  },
  en: {
    badFormat: "Unsupported owned-card JSON format.",
    visibleOf: (total, visible) => `${visible} of ${total} cards shown`,
    ownedChip: "✓ Owned",
    registerChip: "+ Add",
    levelAria: (name) => `${name} level`,
    potentialAria: (name) => `${name} awakening level`,
    potentialOption: (value) => `Awakening ${value}`,
    clearConfirm: "Clear the owned-card list and current preset?",
    nothingToExport: "There are no owned cards to export.",
    noImportable: "The file contains no importable ★4/★5 cards.",
    replaceConfirm: (count) => `Replace the current owned-card list with the ${count} imported cards?`,
    imported: (count) => `Imported ${count} owned cards.`,
    importFailed: (message) => `Could not import owned-card JSON. (${message})`,
  },
  ja: {
    badFormat: "対応していない所持カード JSON 形式です。",
    visibleOf: (total, visible) => `全${total}枚中 ${visible}枚表示`,
    ownedChip: "✓ 所持",
    registerChip: "+ 登録",
    levelAria: (name) => `${name} レベル`,
    potentialAria: (name) => `${name} 覚醒段階`,
    potentialOption: (value) => `覚醒 ${value}`,
    clearConfirm: "所持カード一覧と現在のプリセットをすべて削除しますか？",
    nothingToExport: "エクスポートする所持カードがありません。",
    noImportable: "インポートできる★4・★5カードがありません。",
    replaceConfirm: (count) => `現在の所持カード一覧を、インポートした${count}枚に置き換えますか？`,
    imported: (count) => `${count}枚の所持カードをインポートしました。`,
    importFailed: (message) => `所持カード JSON をインポートできませんでした。(${message})`,
  },
});

function copy() {
  return LOCAL_COPY[getLocale()] ?? LOCAL_COPY.ko;
}

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
    || localeCompare(a.id, b.id);
}

export function compareByReleaseOrder(a, b, charactersById = new Map()) {
  return Number(b.rarity) - Number(a.rarity)
    || numericReleaseOrder(b.order) - numericReleaseOrder(a.order)
    || numericOrder(charactersById.get(a.character_id)?.order) - numericOrder(charactersById.get(b.character_id)?.order)
    || localeCompare(b.id, a.id);
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
  if (!Array.isArray(rows)) throw new Error(copy().badFormat);
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

export function createOwnedCardsView({ cards, charactersById = new Map(), store, onGoDeck, onCardDetail, initiallyVisible = true }) {
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
  const cardRows = new Map();
  const searchText = new Map(displayCards.map(card => [
    card.id, `${card.character_name} ${card.name}`.toLocaleLowerCase(),
  ]));
  let isVisible = initiallyVisible;
  let lastState = null;
  let filteredKey = null;
  let filteredRows = [];

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
    const query = search.value.trim().toLocaleLowerCase();
    const owned = new Set(state.ownedCardIds);
    const key = JSON.stringify([query, rarity.value, attribute.value, status.value, sort.value,
      getLocale(), status.value === "all" ? null : state.ownedCardIds]);
    if (key === filteredKey) return filteredRows;
    const visible = displayCards.filter((card) => {
      const matchesQuery = !query || searchText.get(card.id).includes(query);
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
      visible.sort((a, b) => localeCompare(a.character_name, b.character_name) || Number(a.order) - Number(b.order));
    } else {
      visible.sort((a, b) => compareByReleaseOrder(a, b, charactersById));
    }
    filteredKey = key;
    filteredRows = visible;
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
    // A clamped value can equal the old state; still normalize this input's DOM.
    const row = cardRows.get(cardId);
    if (row) row.signature = null;
    store.setState((state) => {
      const ownedCardSettings = {
        ...state.ownedCardSettings,
        [cardId]: { ...state.ownedCardSettings[cardId], ...patch },
      };
      return { ownedCardSettings };
    });
  }

  function settingsMarkup(card, setting) {
    return `<div class="owned-card-settings">
      <label><span>${t("card.level")}</span><input type="number" min="1" max="${maxLevel(card)}" value="${setting.level}" data-owned-level="${escapeHtml(card.id)}" aria-label="${escapeHtml(copy().levelAria(card.character_name))}"></label>
      <label><span>${t("card.potential")}</span><select data-owned-potential="${escapeHtml(card.id)}" aria-label="${escapeHtml(copy().potentialAria(card.character_name))}">${Array.from({ length: 6 }, (_, value) => `<option value="${value}"${value === setting.potential ? " selected" : ""}>${copy().potentialOption(value)}</option>`).join("")}</select></label>
    </div>`;
  }

  function createRow(card) {
    const element = document.createElement("article");
    element.className = "owned-card";
    element.dataset.ownedRowId = card.id;
    element.setAttribute("style", attributeStyle(card));
    element.innerHTML = `
      <button class="owned-card-toggle" type="button" data-owned-card-id="${escapeHtml(card.id)}" aria-pressed="false">
        <span class="owned-check" aria-hidden="true"></span>
        ${renderLandscapeCardArt(card, { showMeta: false })}
        <span class="landscape-card-copy">
          ${renderLandscapeCardTitle(card)}
          <span class="card-copy-name">${escapeHtml(card.name)}</span>
          <small class="card-copy-meta" hidden></small>
        </span>
      </button>
      <button class="card-detail-button" type="button" data-card-detail="${escapeHtml(card.id)}" aria-label="${escapeHtml(t("card.detailsAria", { character: card.character_name }))}">i</button>`;
    wirePortraitFallback(element);
    return { element, signature: null };
  }

  function updateRow(row, card, owned, setting) {
    const signature = JSON.stringify([owned, setting.level, setting.potential]);
    if (row.signature === signature) return;
    const { element } = row;
    element.classList.toggle("is-owned", owned);
    element.querySelector("[data-owned-card-id]").setAttribute("aria-pressed", String(owned));
    element.querySelector(".owned-check").textContent = owned ? copy().ownedChip : copy().registerChip;
    const meta = element.querySelector(".card-copy-meta");
    meta.hidden = !owned;
    meta.textContent = owned ? `Lv${setting.level} · ${t("card.potential")} ${setting.potential}` : "";
    let settings = element.querySelector(".owned-card-settings");
    if (owned) {
      if (!settings) {
        element.insertAdjacentHTML("beforeend", settingsMarkup(card, setting));
        settings = element.querySelector(".owned-card-settings");
      }
      const level = settings.querySelector("[data-owned-level]");
      const potential = settings.querySelector("[data-owned-potential]");
      if (level.value !== String(setting.level)) level.value = String(setting.level);
      if (potential.value !== String(setting.potential)) potential.value = String(setting.potential);
    } else {
      settings?.remove();
    }
    row.signature = signature;
  }

  function render(state) {
    lastState = state;
    const owned = new Set(state.ownedCardIds);
    const count = displayCards.reduce((total, card) => total + Number(owned.has(card.id)), 0);
    const countText = t("owned.count", { count });
    if (ownedCount.textContent !== countText) ownedCount.textContent = countText;
    if (tabCount.textContent !== String(count)) tabCount.textContent = String(count);
    // The tab count stays current, but a hidden list does no DOM/filter/sort work.
    if (!isVisible) return;
    const visible = filteredCards(state);
    const visibleText = copy().visibleOf(displayCards.length, visible.length);
    if (visibleCount.textContent !== visibleText) visibleCount.textContent = visibleText;
    if (!visible.length) {
      if (!list.querySelector(".empty-state")) {
        list.innerHTML = `<div class="empty-state"><span aria-hidden="true">⌕</span><p>${t("owned.none")}</p></div>`;
      }
      return;
    }
    list.querySelector(".empty-state")?.remove();
    const wanted = new Set(visible.map(card => card.id));
    let cursor = list.firstElementChild;
    for (const card of visible) {
      let row = cardRows.get(card.id);
      if (!row) {
        row = createRow(card);
        cardRows.set(card.id, row);
      }
      updateRow(row, card, owned.has(card.id), cardSetting(state, card));
      if (row.element !== cursor) list.insertBefore(row.element, cursor);
      cursor = row.element.nextElementSibling;
    }
    for (const element of [...list.children]) {
      if (!wanted.has(element.dataset.ownedRowId)) element.remove();
    }
  }

  // Delegate once instead of binding controls after every render.
  list.addEventListener("click", event => {
    const detail = event.target.closest("[data-card-detail]");
    if (detail && list.contains(detail)) {
      onCardDetail?.(detail.dataset.cardDetail, detail);
      return;
    }
    const toggle = event.target.closest("[data-owned-card-id]");
    if (toggle && list.contains(toggle)) toggleCard(toggle.dataset.ownedCardId);
  });
  list.addEventListener("change", event => {
    const control = event.target;
    if (control.matches("[data-owned-level]")) {
      updateCardSetting(control.dataset.ownedLevel, { level: Number(control.value) });
    } else if (control.matches("[data-owned-potential]")) {
      updateCardSetting(control.dataset.ownedPotential, { potential: Number(control.value) });
    }
  });

  function setVisible(visible) {
    isVisible = Boolean(visible);
    if (isVisible) render(lastState ?? store.getState());
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
    if (!window.confirm(copy().clearConfirm)) return;
    store.setState({ ownedCardIds: [] });
  });
  const importInput = requiredElement("#owned-import-file");
  requiredElement("#export-owned-cards").addEventListener("click", () => {
    const state = store.getState();
    if (!state.ownedCardIds.length) {
      window.alert(copy().nothingToExport);
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
      if (!imported.ownedCardIds.length) throw new Error(copy().noImportable);
      if (store.getState().ownedCardIds.length
        && !window.confirm(copy().replaceConfirm(imported.ownedCardIds.length))) return;
      store.setState(imported);
      window.alert(copy().imported(imported.ownedCardIds.length));
    } catch (error) {
      window.alert(copy().importFailed(error.message));
    }
  });
  requiredElement("#owned-go-deck").addEventListener("click", onGoDeck);

  return { render, setVisible };
}
