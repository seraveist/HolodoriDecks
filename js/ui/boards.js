import { connectInfo, connectRange, boardDescription, memoryBonus } from "../board-data.js?v=1.3.1";
import { boostedBoardEffects } from "../board-score.js?v=1.3.1";
import {
  BOARD_STORAGE_KEY, PREVIEW_STORAGE_KEY, migrateBoardPreview, createBoardStore, assignConnector,
  findCardPlacement, samePlacement, decodeBoardImport, validateMemoryCount,
} from "../board-state.js?v=1.3.1";
import { planBoardNodeChange, planBoardCategoryChange, boardCategoryStatus, applyBoardNodePlan } from "../board-paths.js?v=1.3.1";
import { boardText } from "../board-copy.js?v=1.3.1";
import { escapeHtml, renderLandscapeCardArt, wirePortraitFallback } from "./cards.js?v=1.3.1";

export function createBoardsView({ container, data, store, catalog, onGoOwned, onGoDeck, onChange = () => {}, locale = "ko" }) {
  const t = (key, args) => boardText(locale, key, args);
  const e = escapeHtml;
  if (!document.querySelector("link[data-board-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const styleUrl = new URL("../../css/boards.css", import.meta.url);
    // The lazy stylesheet must follow the deployed module's cache revision too.
    styleUrl.search = new URL(import.meta.url).search;
    link.href = styleUrl.href;
    link.dataset.boardStyle = "";
    link.addEventListener("load", () => { if (visible && currentCharacter) fitBoard(); });
    document.head.append(link);
  }
  const characters = data.characters.filter(character => catalog.has(character.id))
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  const characterIds = new Set(characters.map(character => character.id));
  const charactersById = new Map(characters.map(character => [character.id, character]));
  const cardsById = new Map(data.cards.map(card => [card.id, card]));
  let appState = store.getState();
  let ownedSignature = appState.ownedCardIds.join("|");
  let cardSettingsSignature = JSON.stringify(appState.ownedCardSettings);
  const ownedIds = () => new Set(appState.ownedCardIds.filter(id => cardsById.has(id)));
  let visible = false;
  let currentCharacter = null;
  let selectedNode = null;
  let mode = "grid";
  let zoom = 1;
  let target = null;
  let pendingPlacement = null;
  let pendingRoute = null;
  let tooltipNode = null;
  let lastFocusedNode = null;
  let lastBulkButton = null;
  let boardStore;

  container.innerHTML = `
    <div class="section-heading board-heading">
      <div class="section-title-row"><span class="section-number" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="12" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="12" width="6" height="6" rx="1.5"/><rect x="12" y="12" width="6" height="6" rx="1.5"/></svg></span><h2>${e(t("title"))}</h2></div>
      <div class="owned-heading-actions board-heading-actions"><button class="owned-transfer-button" type="button" data-board-action="export">${e(t("export"))}</button><button class="owned-transfer-button" type="button" data-board-action="import">${e(t("import"))}</button><button class="primary-button" type="button" data-board-action="deck">${e(t("goDeck"))}</button><input id="board-import" type="file" accept=".json,application/json" hidden></div>
    </div>
    <p id="board-status" class="board-status" role="status" aria-live="polite"></p>
    <div id="board-overview">
      <section class="board-account"><label class="field" for="board-memory-count"><span>${e(t("memory"))}</span><input id="board-memory-count" type="number" min="0" step="1" inputmode="numeric" placeholder="${e(t("memoryPlaceholder"))}" aria-describedby="board-memory-hint"></label><div class="board-memory-info"><p id="board-memory-bonus" class="board-data-note" role="status"></p><small id="board-memory-hint">${e(t("memoryHint"))}</small></div><button class="owned-transfer-button" type="button" data-board-action="migrate" hidden>${e(t("migrate"))}</button></section>
      <div class="owned-toolbar board-filters"><label class="search-field"><span class="sr-only">${e(t("search"))}</span><input id="board-search" type="search" placeholder="${e(t("search"))}"></label><label class="field compact-field"><span>${e(t("production"))}</span><select id="board-production"><option value="">${e(t("allProductions"))}</option></select></label><label class="field compact-field"><span>${e(t("filter"))}</span><select id="board-filter"><option value="">${e(t("allStates"))}</option><option value="configured">${e(t("configured"))}</option><option value="unconfigured">${e(t("unconfigured"))}</option></select></label></div>
      <div class="owned-summary board-summary"><strong id="board-member-count"></strong></div>
      <div id="board-roster" class="owned-card-list board-roster"></div>
    </div>
    <div id="board-detail" hidden>
      <div class="board-detail-header"><button type="button" data-board-action="back">← ${e(t("back"))}</button><div><h3 id="board-character-title" tabindex="-1"></h3><small id="board-detail-summary"></small></div><button type="button" data-board-action="reset">${e(t("reset"))}</button></div>
      <div class="board-editor"><section class="board-map-panel"><div class="board-tools"><button type="button" data-board-action="grid">${e(t("grid"))}</button><button type="button" data-board-action="list">${e(t("list"))}</button><span class="board-tool-spacer"></span><button type="button" data-board-action="zoomOut" aria-label="${e(t("zoomOut"))}">−</button><output id="board-zoom">100%</output><button type="button" data-board-action="zoomIn" aria-label="${e(t("zoomIn"))}">+</button><button type="button" data-board-action="fit">${e(t("fit"))}</button></div>
      <div class="board-bulk-controls">${["R", "B", "G", "Y"].map(type => `<div class="board-category board-kind-${type}" role="group" aria-label="${e(t(type))}"><span class="board-category-heading"><i aria-hidden="true"></i><strong>${e(t(type))}</strong><small data-board-category-count="${type}"></small></span><div class="board-category-actions"><button type="button" data-board-category="${type}" data-board-action="category-select" aria-label="${e(t(type))} ${e(t("selectAll"))}">${e(t("selectAll"))}</button><button type="button" data-board-category="${type}" data-board-action="category-remove" aria-label="${e(t(type))} ${e(t("removeAll"))}">${e(t("removeAll"))}</button></div></div>`).join("")}</div>
      <div class="board-legend"><span class="board-kind-S"><i aria-hidden="true"></i>${e(t("S"))}</span></div>
      <div id="board-viewport" class="board-viewport" tabindex="0" aria-label="${e(t("grid"))}"><div id="board-canvas" class="board-canvas"></div></div></section>
      </div>
    </div>
    <dialog id="board-card-dialog" class="board-dialog" aria-labelledby="board-picker-title" aria-describedby="board-picker-hint"><div class="board-dialog-inner"><div class="board-dialog-heading"><div><p class="board-eyebrow" id="board-picker-target"></p><h3 id="board-picker-title">${e(t("pickerTitle"))}</h3></div><button class="icon-button" type="button" data-board-action="close" aria-label="${e(t("close"))}">×</button></div><p id="board-picker-hint" class="board-muted">${e(t("pickerHint"))}</p>
    <div id="board-slot-summary" class="board-slot-summary"></div>
    <div class="board-picker-filters"><label class="search-field"><span class="sr-only">${e(t("cardSearch"))}</span><input id="board-card-search" type="search" placeholder="${e(t("cardSearch"))}"></label><label class="field compact-field"><span>${e(t("rarity"))}</span><select id="board-card-rarity"><option value="">${e(t("all"))}</option><option value="5">★5</option><option value="4">★4</option></select></label><label class="board-check"><input id="board-card-available" type="checkbox">${e(t("availableOnly"))}</label></div>
    <p id="board-picker-error" class="board-error" role="alert" hidden></p>
    <output id="board-card-count"></output><div id="board-card-list" class="board-card-list"></div><div class="board-dialog-footer"><button type="button" data-board-action="slot-off">${e(t("toggleOff"))}</button><button type="button" data-board-action="remove">${e(t("remove"))}</button><button type="button" data-board-action="owned">${e(t("goOwned"))}</button></div></div></dialog>
    <dialog id="board-confirm-dialog" class="board-dialog board-confirm" aria-labelledby="board-confirm-title" aria-describedby="board-confirm-message"><div class="board-dialog-inner">
      <div class="board-dialog-heading"><h3 id="board-confirm-title"></h3><button type="button" class="icon-button" data-board-action="dismiss-confirm" aria-label="${e(t("close"))}">×</button></div>
      <p id="board-confirm-message"></p><div id="board-confirm-details"></div>
      <div class="board-dialog-footer"><button type="button" data-board-action="dismiss-confirm">${e(t("cancel"))}</button><button type="button" class="primary-button" data-board-action="confirm"></button></div>
    </div></dialog>
    <div id="board-tooltip" class="board-tooltip" role="tooltip" hidden></div>`;

  const $ = selector => container.querySelector(selector);
  const dialog = $("#board-card-dialog");
  const confirmDialog = $("#board-confirm-dialog");
  const tooltip = $("#board-tooltip");
  const memoryInput = $("#board-memory-count");
  const canvas = $("#board-canvas");
  const viewport = $("#board-viewport");
  const displayName = id => charactersById.get(id)?.name ?? id;
  const where = placement => `${displayName(placement.characterId)} / ${placement.slotId}`;
  const cardName = card => `${card.character_name ?? displayName(card.character_id)} · ${card.name ?? card.id}`;
  function announce(message, error = false) {
    $("#board-status").textContent = message;
    $("#board-status").classList.toggle("board-error", error);
  }
  function report(error) {
    const code = error?.message ?? error;
    const known = ["INVALID_MEMORY_COUNT", "INVALID_BOARD_FILE", "INVALID_NODE", "INVALID_SLOT", "INVALID_CARD", "DUPLICATE_CARD", "CARD_NOT_OWNED", "SLOT_LOCKED", "CARD_IN_USE", "PLACEMENT_CHANGED", "STORAGE_READ_FAILED", "STORAGE_WRITE_FAILED", "BOARD_PROFILE_REVIEW", "BOARD_PATH_UNAVAILABLE", "BOARD_PATH_CHANGED"];
    const message = t(known.includes(code) ? code : "STORAGE_WRITE_FAILED");
    announce(message, true);
    if (dialog.open) {
      $("#board-picker-error").textContent = message;
      $("#board-picker-error").hidden = false;
    }
  }
  let storage = null;
  try { storage = globalThis.localStorage; } catch { /* Permission errors are surfaced below. */ }
  boardStore = createBoardStore({ storage, catalog, getOwnedCardIds: ownedIds, onError: report });
  memoryInput.value = boardStore.getState().memoryCount ?? "";

  function mutate(update, options) {
    try {
      boardStore.commit(update, options);
      announce(t("saved"));
      return true;
    } catch (error) { report(error); return false; }
  }

  function paintMemory() {
    const value = memoryBonus(catalog, boardStore.getState().memoryCount);
    $("#board-memory-bonus").textContent = value.status === "known"
      ? t("memoryBonus", { value: value.percent }) : t(value.status === "unset" ? "memoryUnset" : "memoryUnknown", { max: value.knownThrough });
    try { $('[data-board-action="migrate"]').hidden = !storage?.getItem(PREVIEW_STORAGE_KEY); }
    catch { $('[data-board-action="migrate"]').hidden = true; }
  }
  function importProfile(text, previewOnly = false) {
    const isPreview = previewOnly || JSON.parse(text)?.format === "holodori-board-ui-preview";
    const converted = isPreview ? migrateBoardPreview(text, catalog, ownedIds()) : null;
    const imported = converted?.state ?? decodeBoardImport(text, catalog, ownedIds());
    const warning = isPreview ? t("migrateAsk", { count: Object.keys(imported.boards).length, issues: converted.issues.length })
      + (converted.issues.length ? "\n" + converted.issues.join("\n") : "") : t("importAsk");
    if (!window.confirm(warning)) return;
    if (mutate(() => imported, { replace: true })) {
      memoryInput.value = imported.memoryCount ?? "";
      paintMemory(); announce(t("imported"));
    }
  }
  function connectMarkup(card) {
    const info = connectInfo(catalog, card.id, appState.ownedCardSettings?.[card.id]?.potential ?? 0);
    if (!info) return `<small>${e(t("connectUnavailable"))}</small>`;
    const xs = [0, ...info.cells.map(cell => cell.x)], ys = [0, ...info.cells.map(cell => cell.y)];
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const points = new Set(info.cells.map(cell => `${cell.x},${cell.y}`));
    let cells = "";
    for (let y = maxY; y >= minY; y--) for (let x = minX; x <= maxX; x++) {
      cells += `<i class="${x === 0 && y === 0 ? "is-origin" : points.has(`${x},${y}`) ? "is-covered" : ""}"></i>`;
    }
    const description = catalog.text(info.descriptionLangId).replace(/\[\/?highlight\]/g, "");
    return `<span class="board-connect-effect"><small>${e(t("connectLevel", { level: info.level }))} · ${e(description)}</small><span class="board-range-preview" style="grid-template-columns:repeat(${maxX-minX+1},8px)" role="img" aria-label="${e(t("rangeCells", { count: info.cells.length }))}">${cells}</span></span>`;
  }
  function nodeDetails(node) {
    const definition = node.definition;
    const condition = key => Object.values(catalog.raw.conditions[definition[key]] ?? {})
      .map(row => catalog.text(row.descriptionLangId, row.type)).join(" / ");
    const costs = (definition.consumptions ?? []).map(cost => {
      const item = catalog.raw.items[cost.resourceId];
      return `${catalog.text(item?.nameLangId, cost.resourceId)} × ${cost.quantity}`;
    }).join(" · ");
    const skill = node.effect?.liveActiveSkillId;
    const skillDescriptions = Object.values(catalog.raw.relatedSkills[skill] ?? {})
      .map(level => `${t("connectLevel", {level: level.level})}: ${catalog.text(level.descriptionLangId, skill)}`);
    return `${node.effect ? `<p class="board-effect-description">${e(nodeDescription(node))}</p>` : ""}
      <dl class="board-node-facts"><div><dt>${e(t("pointCost"))}</dt><dd>${Number(definition.consumptionSkillTreePointQuantity ?? 0)}</dd></div>
      ${costs ? `<div><dt>${e(t("materials"))}</dt><dd>${e(costs)}</dd></div>` : ""}
      ${definition.viewConditionGroupId ? `<div><dt>${e(t("viewCondition"))}</dt><dd>${e(condition("viewConditionGroupId"))}</dd></div>` : ""}
      ${definition.unlockConditionGroupId ? `<div><dt>${e(t("unlockCondition"))}</dt><dd>${e(condition("unlockConditionGroupId"))}</dd></div>` : ""}</dl>
      ${skillDescriptions.map(description => `<small class="board-skill-detail">${e(description)}</small>`).join("")}
      ${node.type === "S" ? `<p class="board-muted">${e(t("rangeNote"))}</p>` : ""}`;
  }

  function renderRoster() {
    const state = boardStore.getState();
    const query = $("#board-search").value.trim().toLocaleLowerCase();
    const production = $("#board-production").value;
    const filter = $("#board-filter").value;
    paintMemory();
    const shown = characters.filter(character => {
      const configured = Object.hasOwn(state.boards, character.id);
      return (!query || `${character.name} ${character.short_name} ${character.name_en}`.toLocaleLowerCase().includes(query))
        && (!production || character.production_id === production)
        && (!filter || (filter === "configured") === configured);
    });
    $("#board-member-count").textContent = t("count", { count: shown.length });
    $("#board-roster").innerHTML = shown.map(character => {
      const board = state.boards[character.id];
      const portrait = new URL(`../../assets/characters/${encodeURIComponent(character.id)}.webp`, import.meta.url);
      const revision = document.documentElement.dataset.cardAssetRevision;
      if (revision) portrait.searchParams.set("v", revision);
      return `<button type="button" class="picker-card board-member" data-board-character="${e(character.id)}"><span class="board-member-portrait" aria-hidden="true"><span class="board-member-placeholder">${e(Array.from(character.short_name || character.name)[0])}</span><img data-member-portrait src="${e(portrait.href)}" alt="" loading="lazy" decoding="async"></span><span class="board-member-copy"><strong>${e(character.name)}</strong><small class="board-member-status${board ? " is-configured" : ""}">${e(t(board ? "configured" : "unconfigured"))}</small><small>${e(t("summary", { nodes: board?.unlockedNodes.length ?? 0, slots: Object.keys(board?.connectors ?? {}).length, total: catalog.board(character.id).connectors.length }))}</small></span></button>`;
    }).join("") || `<p class="board-empty">${e(t("noMembers"))}</p>`;
    for (const image of $("#board-roster").querySelectorAll("[data-member-portrait]")) {
      const fallback = () => image.remove();
      image.addEventListener("error", fallback, { once: true });
      if (image.complete && !image.naturalWidth) fallback();
    }
  }

  let effectiveEffects = new Map();
  let renderedBoardKey = null;
  function nodeDescription(node) {
    return boardDescription(catalog, effectiveEffects.get(node.id) ?? node.effect, displayName(currentCharacter));
  }
  function nodeStateMarkup(node, board) {
    const selected = board?.unlockedNodes.includes(node.id);
    const card = cardsById.get(board?.connectors[node.id]);
    return `<span class="board-node-id">${e(node.id)}</span><span class="board-node-symbol" aria-hidden="true">${card ? "▣" : selected ? "✓" : node.type === "S" ? "+" : "·"}</span><span class="board-node-list-copy">${e(node.effect ? nodeDescription(node) : t(node.type))} · ${e(card ? cardName(card) : t(selected ? "selected" : "locked"))}</span>`;
  }
  function paintBoard() {
    if (!currentCharacter) return;
    const state = boardStore.getState();
    const board = state.boards[currentCharacter];
    // App notifications, route changes and dialog closure can reach the same
    // view in one interaction. Keep its DOM/focus when the displayed inputs match.
    const key = JSON.stringify([currentCharacter, board, mode, zoom, selectedNode, pendingRoute?.plan,
      Object.values(board?.connectors ?? {}).map(id => [id, appState.ownedCardSettings?.[id]?.potential ?? 0])]);
    if (key === renderedBoardKey) return;
    hideTooltip();
    canvas.classList.toggle("is-list", mode === "list");
    canvas.classList.toggle("is-compact", mode === "grid" && zoom < 0.7);
    viewport.classList.toggle("is-list", mode === "list");
    const model = catalog.board(currentCharacter);
    if (!model) {
      canvas.innerHTML = `<p class="board-empty">${e(t("unavailableDetail"))}</p>`;
      canvas.style.width = "100%"; canvas.style.height = "auto";
      $("#board-detail-summary").textContent = t("unavailableDetail");
      return;
    }
    const categoryStatus = boardCategoryStatus(state, currentCharacter, catalog);
    for (const [type, status] of Object.entries(categoryStatus)) {
      $(`[data-board-category-count="${type}"]`).textContent = `${status.selected}/${status.total}`;
      $(`[data-board-category="${type}"][data-board-action="category-select"]`).disabled = status.complete;
      $(`[data-board-category="${type}"][data-board-action="category-remove"]`).disabled = status.selected === 0;
    }
    const bounds = model.bounds;
    effectiveEffects = boostedBoardEffects(catalog, currentCharacter, board, appState.ownedCardSettings);
    const columns = bounds.maxX - bounds.minX + 3, rows = bounds.maxY - bounds.minY + 3;
    const pitch = 58 * zoom;
    canvas.style.width = mode === "list" ? "100%" : `${columns * pitch}px`;
    canvas.style.height = mode === "list" ? "auto" : `${rows * pitch}px`;
    const focused = document.activeElement?.dataset?.boardNode;
    const selectedSlot = model.byId.get(selectedNode);
    const rangeCard = selectedSlot?.type === "S" ? board?.connectors[selectedNode] : null;
    const range = rangeCard ? connectRange(catalog, currentCharacter, selectedNode, rangeCard, appState.ownedCardSettings?.[rangeCard]?.potential ?? 0) : [];
    const rangeKeys = new Set(range.map(cell => `${cell.x},${cell.y}`));
    canvas.innerHTML = model.nodes.map(node => {
      const selected = Boolean(board?.unlockedNodes.includes(node.id));
      const card = cardsById.get(board?.connectors[node.id]);
      const label = `${t(node.type)} ${node.id} · ${node.effect ? nodeDescription(node) : ""} · ${t(selected ? "selected" : "locked")}${card ? ` · ${cardName(card)}` : ""}`;
      const position = mode === "list" ? "" : `left:${(node.x - bounds.minX + 1) * pitch}px;top:${(bounds.maxY - node.y + 1) * pitch}px;width:${pitch - 6}px;height:${pitch - 6}px;`;
      return `<button type="button" class="board-node board-kind-${node.type}${selected ? " is-unlocked" : ""}${selectedNode === node.id ? " is-selected" : ""}${card ? " has-card" : ""}${pendingRoute?.plan.added.includes(node.id) ? " is-route-add" : ""}${pendingRoute?.plan.removed.includes(node.id) ? " is-route-remove" : ""}${rangeKeys.has(`${node.x},${node.y}`) ? " is-in-connect-range" : ""}" data-board-node="${e(node.id)}" style="${position}" aria-label="${e(label)}" aria-pressed="${selected}">${nodeStateMarkup(node, board)}</button>`;
    }).join("");
    $("#board-zoom").textContent = `${Math.round(zoom * 100)}%`;
    for (const action of ["grid", "list"]) $( `[data-board-action="${action}"]`).setAttribute("aria-pressed", String(mode === action));
    if (focused) canvas.querySelector(`[data-board-node="${focused}"]`)?.focus({ preventScroll: true });
    $("#board-detail-summary").textContent = t("summary", { nodes: board?.unlockedNodes.length ?? 0, slots: Object.keys(board?.connectors ?? {}).length, total: model.connectors.length });
    renderedBoardKey = key;
  }
  function hideTooltip() {
    if (tooltipNode) canvas.querySelector(`[data-board-node="${tooltipNode}"]`)?.removeAttribute("aria-describedby");
    tooltipNode = null; tooltip.hidden = true;
  }
  function showTooltip(element) {
    if (dialog.open || confirmDialog.open) return;
    const node = catalog.node(currentCharacter, element?.dataset.boardNode);
    if (!node || (tooltipNode === node.id && !tooltip.hidden)) return;
    hideTooltip(); tooltipNode = node.id;
    const board = boardStore.getState().boards[currentCharacter];
    const card = cardsById.get(board?.connectors[node.id]);
    tooltip.innerHTML = `<div class="board-tooltip-heading"><strong>${e(t(node.type))} · ${e(node.id)}</strong><span>${e(t(board?.unlockedNodes.includes(node.id) ? "selected" : "locked"))}</span></div>${nodeDetails(node)}${node.type === "S" ? `<p>${e(card ? cardName(card) : t("noCard"))}</p>${card ? connectMarkup(card) : ""}` : ""}`;
    element.setAttribute("aria-describedby", "board-tooltip");
    tooltip.hidden = false;
    const rect = element.getBoundingClientRect(), tip = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tip.width - 8, rect.left + rect.width / 2 - tip.width / 2))}px`;
    tooltip.style.top = `${Math.max(8, rect.top >= tip.height + 16 ? rect.top - tip.height - 10 : Math.min(window.innerHeight - tip.height - 8, rect.bottom + 10))}px`;
  }
  function updateModalState() { document.body.classList.toggle("board-modal-open", dialog.open || confirmDialog.open); }
  function showConfirmation(title, message, details, label) {
    hideTooltip();
    $("#board-confirm-title").textContent = title;
    $("#board-confirm-message").textContent = message;
    $("#board-confirm-details").innerHTML = details;
    $('[data-board-action="confirm"]').textContent = label;
    confirmDialog.showModal(); updateModalState();
    // Cancellation is the initial keyboard action for changes affecting several cells.
    confirmDialog.querySelector('[data-board-action="dismiss-confirm"]')?.focus();
  }
  function applyRoute(plan, openConnect) {
    const changed = mutate(state => applyBoardNodePlan(state, plan, catalog));
    if (changed && openConnect) openPicker();
    return changed;
  }
  function requestNodeChange(nodeId, action = "auto") {
    hideTooltip(); selectedNode = nodeId; lastFocusedNode = nodeId; lastBulkButton = null;
    const node = catalog.node(currentCharacter, nodeId);
    const state = boardStore.getState();
    try {
      const plan = planBoardNodeChange(state, currentCharacter, nodeId, catalog, action);
      if (node.type === "S" && action === "auto" && plan.action === "remove") {
        paintBoard(); openPicker(); return;
      }
      const openConnect = node.type === "S" && plan.action === "select";
      if (!plan.needsConfirmation) { applyRoute(plan, openConnect); return; }
      pendingRoute = { plan, openConnect }; paintBoard();
      const ids = plan.action === "select" ? plan.added : plan.removed;
      const details = changeDetails(plan);
      showConfirmation(t(plan.action === "select" ? "routeTitle" : "disconnectTitle"),
        t(plan.action === "select" ? "routeAsk" : "disconnectAsk", { node: nodeId, count: ids.length }), details,
        t(plan.action === "select" ? "confirmSelect" : "confirmRemove"));
    } catch (error) { report(error); }
  }
  function changeDetails(plan) {
    const ids = plan.action === "select" ? plan.added : plan.removed;
    const extra = plan.category ? ids.filter(id => catalog.node(currentCharacter, id)?.type !== plan.category).length : 0;
    return (extra ? `<p>${e(t(plan.action === "select" ? "categoryExtraSelect" : "categoryExtraRemove", { count: extra }))}</p>` : "")
      + `<div class="board-route-nodes">${ids.map(id => `<span>${e(id)}</span>`).join("")}</div>`
      + (plan.removedCards.length ? `<p class="board-removed-cards">${e(t("removedCards"))}</p><ul>${plan.removedCards.map(({slotId, cardId}) => `<li>${e(slotId)} · ${e(cardName(cardsById.get(cardId)))}</li>`).join("")}</ul>` : "");
  }
  function requestCategoryChange(category, action, button) {
    hideTooltip(); selectedNode = null; lastFocusedNode = null; lastBulkButton = button;
    try {
      const plan = planBoardCategoryChange(boardStore.getState(), currentCharacter, category, catalog, action);
      if (!plan.needsConfirmation) return;
      pendingRoute = { plan, openConnect: false }; paintBoard();
      showConfirmation(t(action === "select" ? "categorySelectTitle" : "categoryRemoveTitle", { category: t(category) }),
        t(action === "select" ? "categorySelectAsk" : "categoryRemoveAsk", { category: t(category), count: plan.added.length + plan.removed.length }),
        changeDetails(plan), t(action === "select" ? "confirmSelect" : "confirmRemove"));
    } catch (error) { report(error); }
  }
  function fitBoard() {
    const model = catalog.board(currentCharacter);
    if (mode !== "grid" || !model) return;
    const bounds = model.bounds;
    zoom = Math.max(0.2, Math.min(1, (viewport.clientWidth - 16) / ((bounds.maxX - bounds.minX + 3) * 58), (viewport.clientHeight - 16) / ((bounds.maxY - bounds.minY + 3) * 58)));
    paintBoard();
    viewport.scrollTo(0, 0);
  }
  function syncRoute() {
    const match = window.location.hash.match(/^#board\/([^/]+)$/);
    let id = null;
    try { id = match ? decodeURIComponent(match[1]) : null; } catch { /* Invalid hashes use the list. */ }
    const next = characterIds.has(id) ? id : null;
    const changed = next !== currentCharacter;
    if (changed) { if (confirmDialog.open) confirmDialog.close(); if (dialog.open) dialog.close(); hideTooltip(); }
    currentCharacter = next;
    $("#board-overview").hidden = Boolean(next);
    $("#board-detail").hidden = !next;
    if (next) {
      if (changed) selectedNode = null;
      $("#board-character-title").textContent = displayName(next);
      $("#board-detail").dataset.characterId = next;
      paintBoard();
      if (changed && visible) {
        requestAnimationFrame(fitBoard);
        $("#board-character-title").focus({ preventScroll: true });
      }
    } else renderRoster();
  }

  function pickerCards(placements) {
    const query = $("#board-card-search").value.trim().toLocaleLowerCase();
    const rarity = $("#board-card-rarity").value;
    const onlyAvailable = $("#board-card-available").checked;
    return [...ownedIds()].map(id => cardsById.get(id)).filter(card => {
      const placement = placements.get(card.id);
      return (!query || cardName(card).toLocaleLowerCase().includes(query))
        && (!rarity || Number(card.rarity) === Number(rarity))
        && (!onlyAvailable || (catalog.canConnect(card.id) && (!placement || samePlacement(placement, target))));
    }).sort((a, b) => Number(b.rarity) - Number(a.rarity) || (a.order ?? 9999) - (b.order ?? 9999));
  }
  function paintPicker() {
    if (!target) return;
    const state = boardStore.getState();
    const placements = new Map();
    for (const [characterId, board] of Object.entries(state.boards)) {
      for (const [slotId, cardId] of Object.entries(board.connectors)) placements.set(cardId, { characterId, slotId });
    }
    const cards = pickerCards(placements);
    const currentBoard = state.boards[target.characterId];
    $("#board-slot-summary").innerHTML = catalog.board(target.characterId).connectors.map(slotId => {
      const card = cardsById.get(currentBoard?.connectors[slotId]);
      return `<div class="board-slot-status${slotId === target.slotId ? " is-current" : ""}"><strong>${e(slotId)}${slotId === target.slotId ? ` · ${e(t("current"))}` : ""}</strong><span>${e(card ? cardName(card) : t(currentBoard?.unlockedNodes.includes(slotId) ? "noCard" : "locked"))}</span></div>`;
    }).join("");
    $("#board-card-count").textContent = t("cardsShown", { count: cards.length });
    $("#board-card-list").innerHTML = cards.map(card => {
      const placement = placements.get(card.id);
      const isCurrent = placement && samePlacement(placement, target);
      const usedElsewhere = placement && !isCurrent;
      const setting = appState.ownedCardSettings?.[card.id] ?? {};
      const label = usedElsewhere ? t("used", { where: where(placement) }) : t(isCurrent ? "current" : "available");
      return `<button type="button" class="board-picker-card${usedElsewhere ? " is-used" : ""}${isCurrent ? " is-current" : ""}" data-board-card="${e(card.id)}" ${catalog.canConnect(card.id) ? "" : "disabled"} aria-label="${e(`${cardName(card)} · ${label}`)}">${renderLandscapeCardArt(card)}<span class="board-picker-copy"><strong>${e(card.character_name ?? displayName(card.character_id))}</strong><span>${e(card.name)}</span><small>${e(t("cardSetting", { level: setting.level ?? "—", potential: setting.potential ?? 0 }))}</small><span class="board-card-state">${e(label)}</span>${connectMarkup(card)}</span></button>`;
    }).join("") || `<p class="board-empty">${e(t(ownedIds().size ? "noCards" : "noOwned"))}</p>`;
    $( '[data-board-action="remove"]').disabled = !state.boards[target.characterId]?.connectors[target.slotId];
    wirePortraitFallback($("#board-card-list"));
  }
  function cancelPlacement() {
    if (pendingPlacement && confirmDialog.open) confirmDialog.close();
    pendingPlacement = null;
    $("#board-picker-error").hidden = true;
  }
  function openPicker() {
    target = { characterId: currentCharacter, slotId: selectedNode };
    if (!boardStore.getState().boards[currentCharacter]?.unlockedNodes.includes(selectedNode)) return;
    lastFocusedNode = selectedNode;
    cancelPlacement();
    $("#board-card-search").value = "";
    $("#board-card-rarity").value = "";
    $("#board-card-available").checked = false;
    $("#board-picker-target").textContent = where(target);
    paintPicker();
    dialog.showModal();
    updateModalState();
    $("#board-card-search").focus();
  }
  function applyPlacement(cardId, options) {
    const destination = { ...target };
    if (mutate(state => assignConnector(state, destination, cardId, ownedIds(), catalog, options))) dialog.close();
    else { pendingPlacement = null; paintPicker(); }
  }
  function requestPlacement(cardId) {
    cancelPlacement();
    const state = boardStore.getState();
    const source = findCardPlacement(state, cardId);
    const targetCard = state.boards[target.characterId]?.connectors[target.slotId] ?? null;
    const move = source && !samePlacement(source, target);
    const replace = targetCard && targetCard !== cardId;
    const options = { expectedTargetCard: targetCard, ...(move ? { moveFrom: source } : {}) };
    if (!move && !replace) { applyPlacement(cardId, options); return; }
    pendingPlacement = { cardId, options };
    const parts = [];
    if (move) parts.push(t("moveAsk", { card: cardName(cardsById.get(cardId)), from: where(source), to: where(target) }));
    if (replace) parts.push(t("replaceAsk", { card: cardName(cardsById.get(targetCard)) }));
    showConfirmation(t(move ? "moveTitle" : "replaceTitle"), parts.join(" "), "", t("confirm"));
  }

  for (const production of [...new Set(characters.map(character => character.production_id).filter(Boolean))]) {
    const option = document.createElement("option");
    option.value = production;
    option.textContent = production.replace(/^prd-/, "").toUpperCase();
    $("#board-production").append(option);
  }
  for (const selector of ["#board-search", "#board-filter", "#board-production"]) $(selector).addEventListener("input", renderRoster);
  for (const selector of ["#board-card-search", "#board-card-rarity", "#board-card-available"]) $(selector).addEventListener("input", () => { cancelPlacement(); paintPicker(); });
  memoryInput.addEventListener("change", () => {
    const raw = memoryInput.value.trim();
    try {
      if (memoryInput.validity.badInput || (raw && !/^\d+$/.test(raw))) throw new Error("INVALID_MEMORY_COUNT");
      const memoryCount = validateMemoryCount(raw === "" ? null : Number(raw));
      memoryInput.setCustomValidity("");
      memoryInput.removeAttribute("aria-invalid");
      if (!mutate(state => ({ ...state, memoryCount }))) memoryInput.value = boardStore.getState().memoryCount ?? "";
    } catch (error) {
      memoryInput.setCustomValidity(t("INVALID_MEMORY_COUNT"));
      memoryInput.setAttribute("aria-invalid", "true");
      report(error);
    }
  });
  memoryInput.addEventListener("input", () => { memoryInput.setCustomValidity(""); memoryInput.removeAttribute("aria-invalid"); });
  $("#board-import").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("INVALID_BOARD_FILE");
      importProfile(await file.text());
    } catch (error) { report(error); }
  });
  container.addEventListener("click", event => {
    const element = event.target.closest("button");
    if (!element || element.disabled) return;
    if (element.dataset.boardCharacter) {
      window.location.hash = `board/${encodeURIComponent(element.dataset.boardCharacter)}`;
      return;
    }
    if (element.dataset.boardNode) {
      requestNodeChange(element.dataset.boardNode);
      return;
    }
    if (element.dataset.boardCard) { requestPlacement(element.dataset.boardCard); return; }
    switch (element.dataset.boardAction) {
      case "category-select": case "category-remove":
        requestCategoryChange(element.dataset.boardCategory, element.dataset.boardAction === "category-select" ? "select" : "remove", element); break;
      case "back": window.location.hash = "board"; break;
      case "slot-off": {
        const slotId = target.slotId;
        dialog.close(); requestNodeChange(slotId, "remove"); break;
      }
      case "close": dialog.close(); break;
      case "dismiss-confirm": confirmDialog.close(); break;
      case "confirm": {
        const route = pendingRoute, placement = pendingPlacement;
        pendingRoute = null; pendingPlacement = null;
        confirmDialog.close();
        if (route) applyRoute(route.plan, route.openConnect);
        else if (placement) applyPlacement(placement.cardId, placement.options);
        break;
      }
      case "remove": applyPlacement(null, { expectedTargetCard: boardStore.getState().boards[target.characterId]?.connectors[target.slotId] ?? null }); break;
      case "owned": dialog.close(); onGoOwned(); break;
      case "deck": onGoDeck?.(); break;
      case "reset":
        if (window.confirm(t("resetAsk"))) mutate(state => { delete state.boards[currentCharacter]; return state; });
        break;
      case "grid": case "list": mode = element.dataset.boardAction; paintBoard(); break;
      case "zoomIn": case "zoomOut": {
        const oldZoom = zoom;
        zoom = Math.min(1.6, Math.max(0.2, zoom + (element.dataset.boardAction === "zoomIn" ? 0.15 : -0.15)));
        const x = (viewport.scrollLeft + viewport.clientWidth / 2) * zoom / oldZoom - viewport.clientWidth / 2;
        const y = (viewport.scrollTop + viewport.clientHeight / 2) * zoom / oldZoom - viewport.clientHeight / 2;
        mode = "grid"; paintBoard(); viewport.scrollTo(x, y); break;
      }
      case "fit": mode = "grid"; fitBoard(); break;
      case "import": $("#board-import").click(); break;
      case "migrate": {
        try { const text = storage?.getItem(PREVIEW_STORAGE_KEY); if (text) importProfile(text, true); else announce(t("noPreview")); }
        catch(error) { report(error); }
        break;
      }
      case "export": {
        const blob = new Blob([JSON.stringify(boardStore.getState(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = "holodori-boards.json"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); break;
      }
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    updateModalState();
    cancelPlacement();
    if (visible && lastFocusedNode) $(`[data-board-node="${lastFocusedNode}"]`)?.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  confirmDialog.addEventListener("close", () => {
    if (confirmDialog.open) return;
    pendingRoute = null; pendingPlacement = null; updateModalState();
    if (visible && currentCharacter) paintBoard();
    if (!dialog.open && visible && lastFocusedNode) $(`[data-board-node="${lastFocusedNode}"]`)?.focus({ preventScroll: true });
    else if (!dialog.open && visible && lastBulkButton?.isConnected) {
      const focusTarget = lastBulkButton.disabled ? lastBulkButton.parentElement.querySelector("button:not(:disabled)") : lastBulkButton;
      focusTarget?.focus({ preventScroll: true });
    }
  });
  confirmDialog.addEventListener("click", event => { if (event.target === confirmDialog) confirmDialog.close(); });
  canvas.addEventListener("pointerover", event => { if (event.pointerType !== "touch") showTooltip(event.target.closest("[data-board-node]")); });
  canvas.addEventListener("pointerout", event => { if (!event.target.closest("[data-board-node]")?.contains(event.relatedTarget)) hideTooltip(); });
  canvas.addEventListener("focusin", event => showTooltip(event.target.closest("[data-board-node]")));
  canvas.addEventListener("focusout", hideTooltip);
  container.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  boardStore.subscribe(() => {
    onChange();
    if (!visible) return;
    currentCharacter ? paintBoard() : renderRoster();
    paintMemory();
    if (dialog.open) paintPicker();
  });
  window.addEventListener("hashchange", () => { if (visible) syncRoute(); });
  window.addEventListener("storage", event => {
    if (event.key !== BOARD_STORAGE_KEY && event.key !== null) return;
    cancelPlacement();
    boardStore.refresh();
    memoryInput.value = boardStore.getState().memoryCount ?? "";
  });
  syncRoute();
  return {
    setVisible(next) {
      const changed = visible !== next;
      visible = next;
      if (!visible) { if (confirmDialog.open) confirmDialog.close(); if (dialog.open) dialog.close(); hideTooltip(); }
      if (visible) {
        syncRoute();
        if (changed && currentCharacter) requestAnimationFrame(fitBoard);
      }
    },
    render(state) {
      appState = state;
      const signature = state.ownedCardIds.join("|");
      const settingsSignature = JSON.stringify(state.ownedCardSettings);
      const cardsChanged = signature !== ownedSignature || settingsSignature !== cardSettingsSignature;
      cardSettingsSignature = settingsSignature;
      if (signature !== ownedSignature) {
        const owned = ownedIds();
        const removed = Object.values(boardStore.getState().boards).some(board => Object.values(board.connectors).some(id => !owned.has(id)));
        ownedSignature = signature;
        cancelPlacement();
        // commit() reconciles against the current ownership before this update.
        if (removed && mutate(current => current)) announce(t("ownershipChanged"));
      }
      if (cardsChanged && visible && currentCharacter) paintBoard();
      if (cardsChanged && visible && dialog.open) paintPicker();
    },
  };
}
