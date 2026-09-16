import { connectInfo, connectRange, boardDescription, memoryBonus } from "../board-data.js?v=1.3.1";
import {
  BOARD_STORAGE_KEY, PREVIEW_STORAGE_KEY, migrateBoardPreview, createBoardStore, toggleBoardNode, assignConnector,
  findCardPlacement, samePlacement, decodeBoardImport, validateMemoryCount,
} from "../board-state.js?v=1.3.1";
import { boardText } from "../board-copy.js?v=1.3.1";
import { escapeHtml, renderLandscapeCardArt, wirePortraitFallback } from "./cards.js?v=1.3.1";

export function createBoardsView({ container, data, store, catalog, onGoOwned, locale = "ko" }) {
  const t = (key, args) => boardText(locale, key, args);
  const e = escapeHtml;
  if (!document.querySelector("link[data-board-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../../css/boards.css?v=1.3.1", import.meta.url).href;
    link.dataset.boardStyle = "";
    link.addEventListener("load", () => { if (visible && currentCharacter) fitBoard(); });
    document.head.append(link);
  }
  const characters = [...data.characters].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  const characterIds = new Set(characters.map(character => character.id));
  const charactersById = new Map(characters.map(character => [character.id, character]));
  const cardsById = new Map(data.cards.map(card => [card.id, card]));
  const representativeCards = new Map();
  for (const card of data.cards) {
    const previous = representativeCards.get(card.character_id);
    if (!previous || Number(card.rarity) > Number(previous.rarity)) representativeCards.set(card.character_id, card);
  }
  let appState = store.getState();
  let ownedSignature = appState.ownedCardIds.join("|");
  const ownedIds = () => new Set(appState.ownedCardIds.filter(id => cardsById.has(id)));
  let visible = false;
  let currentCharacter = null;
  let selectedNode = null;
  let mode = "grid";
  let zoom = 1;
  let target = null;
  let pendingPlacement = null;
  let lastFocusedNode = null;
  let boardStore;

  container.innerHTML = `
    <div class="board-header"><div><p class="board-eyebrow">BOARD WORKSPACE</p><h2>${e(t("title"))}</h2><p>${e(t("intro"))}</p></div><span class="board-preview-badge">${e(t("preview"))}</span></div>
    <p class="board-notice">${e(t("notice"))}</p>
    <p id="board-status" class="board-status" role="status" aria-live="polite"></p>
    <div id="board-overview">
      <section class="board-account"><label for="board-memory-count">${e(t("memory"))}</label><input id="board-memory-count" type="number" min="0" step="1" inputmode="numeric" placeholder="${e(t("memoryPlaceholder"))}" aria-describedby="board-memory-hint"><small id="board-memory-hint">${e(t("memoryHint"))}</small><div class="board-actions"><button type="button" data-board-action="export">${e(t("export"))}</button><button type="button" data-board-action="import">${e(t("import"))}</button><input id="board-import" type="file" accept=".json,application/json" hidden></div></section>
      <p id="board-memory-bonus" class="board-data-note" role="status"></p><button type="button" data-board-action="migrate">${e(t("migrate"))}</button>
      <div class="board-filters"><label>${e(t("search"))}<input id="board-search" type="search" placeholder="${e(t("search"))}"></label><label>${e(t("production"))}<select id="board-production"><option value="">${e(t("all"))}</option></select></label><label>${e(t("filter"))}<select id="board-filter"><option value="">${e(t("all"))}</option><option value="configured">${e(t("configured"))}</option><option value="unconfigured">${e(t("unconfigured"))}</option></select></label><output id="board-member-count"></output></div>
      <div id="board-roster" class="board-roster"></div>
    </div>
    <div id="board-detail" hidden>
      <div class="board-detail-header"><button type="button" data-board-action="back">← ${e(t("back"))}</button><div><h3 id="board-character-title" tabindex="-1"></h3><small id="board-model-reference"></small></div><button type="button" data-board-action="reset">${e(t("reset"))}</button></div>
      <div class="board-editor"><section class="board-map-panel"><div class="board-tools"><button type="button" data-board-action="grid">${e(t("grid"))}</button><button type="button" data-board-action="list">${e(t("list"))}</button><span class="board-tool-spacer"></span><button type="button" data-board-action="zoomOut" aria-label="${e(t("zoomOut"))}">−</button><output id="board-zoom">100%</output><button type="button" data-board-action="zoomIn" aria-label="${e(t("zoomIn"))}">+</button><button type="button" data-board-action="fit">${e(t("fit"))}</button></div>
      <div class="board-legend">${["R", "B", "G", "Y", "S"].map(type => `<span class="board-kind-${type}"><i aria-hidden="true"></i>${e(t(type))}</span>`).join("")}</div>
      <div id="board-viewport" class="board-viewport" tabindex="0" aria-label="${e(t("grid"))}"><div id="board-canvas" class="board-canvas"></div></div></section>
      <aside class="board-side"><section id="board-node-detail"></section><h4>${e(t("S"))}</h4><div id="board-connectors" class="board-connectors"></div><p id="board-detail-summary" class="board-muted"></p></aside></div>
    </div>
    <dialog id="board-card-dialog" class="board-dialog" aria-labelledby="board-picker-title" aria-describedby="board-picker-hint"><div class="board-dialog-inner"><div class="board-dialog-heading"><div><p class="board-eyebrow" id="board-picker-target"></p><h3 id="board-picker-title">${e(t("pickerTitle"))}</h3></div><button type="button" data-board-action="close" aria-label="${e(t("close"))}">×</button></div><p id="board-picker-hint" class="board-muted">${e(t("pickerHint"))}</p>
    <div class="board-picker-filters"><label>${e(t("cardSearch"))}<input id="board-card-search" type="search"></label><label>${e(t("rarity"))}<select id="board-card-rarity"><option value="">${e(t("all"))}</option><option value="5">★5</option><option value="4">★4</option></select></label><label class="board-check"><input id="board-card-available" type="checkbox">${e(t("availableOnly"))}</label></div>
    <p id="board-picker-error" class="board-error" role="alert" hidden></p><section id="board-transfer" class="board-transfer" hidden><p id="board-transfer-text"></p><div class="board-actions"><button type="button" data-board-action="confirm">${e(t("confirm"))}</button><button type="button" data-board-action="cancel">${e(t("cancel"))}</button></div></section>
    <output id="board-card-count"></output><div id="board-card-list" class="board-card-list"></div><div class="board-dialog-footer"><button type="button" data-board-action="remove">${e(t("remove"))}</button><button type="button" data-board-action="owned">${e(t("goOwned"))}</button></div></div></dialog>`;

  const $ = selector => container.querySelector(selector);
  const dialog = $("#board-card-dialog");
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
    const known = ["INVALID_MEMORY_COUNT", "INVALID_BOARD_FILE", "INVALID_NODE", "INVALID_SLOT", "INVALID_CARD", "DUPLICATE_CARD", "CARD_NOT_OWNED", "SLOT_LOCKED", "CARD_IN_USE", "PLACEMENT_CHANGED", "STORAGE_READ_FAILED", "STORAGE_WRITE_FAILED", "BOARD_PROFILE_REVIEW"];
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
    return `${node.effect ? `<p class="board-effect-description">${e(boardDescription(catalog,node.effect,displayName(currentCharacter)))}</p>` : ""}
      <dl class="board-node-facts"><div><dt>${e(t("pointCost"))}</dt><dd>${Number(definition.consumptionSkillTreePointQuantity ?? 0)}</dd></div>
      ${costs ? `<div><dt>${e(t("materials"))}</dt><dd>${e(costs)}</dd></div>` : ""}
      ${definition.viewConditionGroupId ? `<div><dt>${e(t("viewCondition"))}</dt><dd>${e(condition("viewConditionGroupId"))}</dd></div>` : ""}
      ${definition.unlockConditionGroupId ? `<div><dt>${e(t("unlockCondition"))}</dt><dd>${e(condition("unlockConditionGroupId"))}</dd></div>` : ""}</dl>
      ${skillDescriptions.map(description => `<small class="board-skill-detail">${e(description)}</small>`).join("")}
      <p class="board-muted">${e(t("recordOnly"))}</p>${node.type === "S" ? `<p class="board-muted">${e(t("rangeNote"))}</p>` : ""}`;
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
      const card = representativeCards.get(character.id);
      return `<button type="button" class="board-member" data-board-character="${e(character.id)}" ${catalog.has(character.id) ? "" : "disabled"}>${card ? renderLandscapeCardArt(card, { showMeta: false }) : '<span class="board-member-placeholder" aria-hidden="true">H</span>'}<span class="board-member-copy"><strong>${e(character.name)}</strong><small class="board-member-status">${e(t(!catalog.has(character.id) ? "boardUnavailable" : board ? "configured" : "unconfigured"))}</small><small>${e(t("summary", { nodes: board?.unlockedNodes.length ?? 0, slots: Object.keys(board?.connectors ?? {}).length, total: catalog.board(character.id)?.connectors.length ?? 0 }))}</small></span></button>`;
    }).join("") || `<p class="board-empty">${e(t("noMembers"))}</p>`;
    wirePortraitFallback($("#board-roster"));
  }

  function nodeStateMarkup(node, board) {
    const selected = board?.unlockedNodes.includes(node.id);
    const card = cardsById.get(board?.connectors[node.id]);
    return `<span class="board-node-id">${e(node.id)}</span><span class="board-node-symbol" aria-hidden="true">${card ? "▣" : selected ? "✓" : node.type === "S" ? "+" : "·"}</span><span class="board-node-list-copy">${e(node.effect ? boardDescription(catalog, node.effect, displayName(currentCharacter)) : t(node.type))} · ${e(card ? cardName(card) : t(selected ? "selected" : "locked"))}</span>`;
  }
  function paintBoard() {
    if (!currentCharacter) return;
    const state = boardStore.getState();
    const board = state.boards[currentCharacter];
    canvas.classList.toggle("is-list", mode === "list");
    canvas.classList.toggle("is-compact", mode === "grid" && zoom < 0.7);
    viewport.classList.toggle("is-list", mode === "list");
    const model = catalog.board(currentCharacter);
    $("#board-model-reference").textContent = model ? `${model.id} · Master ${catalog.sourceCommit.slice(0, 8)}` : t("boardUnavailable");
    if (!model) {
      canvas.innerHTML = `<p class="board-empty">${e(t("unavailableDetail"))}</p>`;
      canvas.style.width = "100%"; canvas.style.height = "auto";
      $("#board-connectors").innerHTML = ""; $("#board-node-detail").innerHTML = "";
      $("#board-detail-summary").textContent = t("unavailableDetail");
      return;
    }
    const bounds = model.bounds;
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
      const label = `${t(node.type)} ${node.id} · ${node.effect ? boardDescription(catalog, node.effect, displayName(currentCharacter)) : ""} · ${t(selected ? "selected" : "locked")}${card ? ` · ${cardName(card)}` : ""}`;
      const position = mode === "list" ? "" : `left:${(node.x - bounds.minX + 1) * pitch}px;top:${(bounds.maxY - node.y + 1) * pitch}px;width:${pitch - 6}px;height:${pitch - 6}px;`;
      return `<button type="button" class="board-node board-kind-${node.type}${selected ? " is-unlocked" : ""}${selectedNode === node.id ? " is-selected" : ""}${card ? " has-card" : ""}${rangeKeys.has(`${node.x},${node.y}`) ? " is-in-connect-range" : ""}" data-board-node="${e(node.id)}" style="${position}" aria-label="${e(label)}" aria-pressed="${selectedNode === node.id}" title="${e(label)}">${nodeStateMarkup(node, board)}</button>`;
    }).join("");
    $("#board-zoom").textContent = `${Math.round(zoom * 100)}%`;
    for (const action of ["grid", "list"]) $( `[data-board-action="${action}"]`).setAttribute("aria-pressed", String(mode === action));
    if (focused) canvas.querySelector(`[data-board-node="${focused}"]`)?.focus({ preventScroll: true });
    paintNodeDetail();
    $("#board-connectors").innerHTML = model.connectors.map(slotId => {
      const card = cardsById.get(board?.connectors[slotId]);
      const unlocked = Boolean(board?.unlockedNodes.includes(slotId));
      return `<button type="button" class="board-connector${unlocked ? " is-unlocked" : ""}" data-board-node="${e(slotId)}"><strong>${e(slotId)}</strong><span>${e(card ? cardName(card) : t(unlocked ? "noCard" : "locked"))}</span></button>`;
    }).join("");
    $("#board-detail-summary").textContent = t("summary", { nodes: board?.unlockedNodes.length ?? 0, slots: Object.keys(board?.connectors ?? {}).length, total: model.connectors.length });
  }
  function paintNodeDetail() {
    const node = catalog.node(currentCharacter, selectedNode);
    if (!node) { $("#board-node-detail").innerHTML = `<p class="board-muted">${e(t("selectNode"))}</p>`; return; }
    const board = boardStore.getState().boards[currentCharacter];
    const unlocked = Boolean(board?.unlockedNodes.includes(node.id));
    const card = cardsById.get(board?.connectors[node.id]);
    $("#board-node-detail").innerHTML = `<p class="board-eyebrow">${e(t(node.type))}</p><h4>${e(node.id)}</h4><p class="board-node-state">${e(t(unlocked ? "selected" : "locked"))}</p>${nodeDetails(node)}<button type="button" class="board-node-toggle" data-board-action="toggle">${e(t(unlocked ? "toggleOff" : "toggleOn"))}</button>${node.type === "S" ? `<div class="board-slot-detail">${card ? renderLandscapeCardArt(card) + `<p>${e(cardName(card))}</p>${connectMarkup(card)}` : `<p>${e(t("noCard"))}</p>`}<button type="button" data-board-action="picker" ${unlocked ? "" : "disabled"}>${e(t(card ? "changeCard" : "chooseCard"))}</button>${unlocked ? "" : `<small>${e(t("unlockFirst"))}</small>`}</div>` : ""}`;
    wirePortraitFallback($("#board-node-detail"));
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
    if (changed && dialog.open) dialog.close();
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

  function pickerCards() {
    const query = $("#board-card-search").value.trim().toLocaleLowerCase();
    const rarity = $("#board-card-rarity").value;
    const onlyAvailable = $("#board-card-available").checked;
    const state = boardStore.getState();
    return [...ownedIds()].map(id => cardsById.get(id)).filter(card => {
      const placement = findCardPlacement(state, card.id);
      return (!query || cardName(card).toLocaleLowerCase().includes(query))
        && (!rarity || Number(card.rarity) === Number(rarity))
        && (!onlyAvailable || (catalog.canConnect(card.id) && (!placement || samePlacement(placement, target))));
    }).sort((a, b) => Number(b.rarity) - Number(a.rarity) || (a.order ?? 9999) - (b.order ?? 9999));
  }
  function paintPicker() {
    if (!target) return;
    const state = boardStore.getState();
    const cards = pickerCards();
    $("#board-card-count").textContent = t("cardsShown", { count: cards.length });
    $("#board-card-list").innerHTML = cards.map(card => {
      const placement = findCardPlacement(state, card.id);
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
    pendingPlacement = null;
    $("#board-transfer").hidden = true;
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
    document.body.classList.add("board-modal-open");
    $("#board-card-search").focus();
  }
  function applyPlacement(cardId, options) {
    const destination = { ...target };
    if (mutate(state => assignConnector(state, destination, cardId, ownedIds(), catalog, options))) dialog.close();
    else { pendingPlacement = null; $("#board-transfer").hidden = true; paintPicker(); }
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
    $("#board-transfer-text").textContent = parts.join(" ");
    $("#board-transfer").hidden = false;
    $( '[data-board-action="confirm"]').focus();
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
      selectedNode = element.dataset.boardNode;
      paintBoard();
      return;
    }
    if (element.dataset.boardCard) { requestPlacement(element.dataset.boardCard); return; }
    switch (element.dataset.boardAction) {
      case "back": window.location.hash = "board"; break;
      case "toggle": {
        const assigned = boardStore.getState().boards[currentCharacter]?.connectors[selectedNode];
        if (assigned && !window.confirm(t("unlockAsk"))) break;
        if (mutate(state => toggleBoardNode(state, currentCharacter, selectedNode, catalog))) $( '[data-board-action="toggle"]').focus({ preventScroll: true });
        break;
      }
      case "picker": openPicker(); break;
      case "close": dialog.close(); break;
      case "cancel": cancelPlacement(); $("#board-card-search").focus(); break;
      case "confirm": if (pendingPlacement) applyPlacement(pendingPlacement.cardId, pendingPlacement.options); break;
      case "remove": applyPlacement(null, { expectedTargetCard: boardStore.getState().boards[target.characterId]?.connectors[target.slotId] ?? null }); break;
      case "owned": dialog.close(); onGoOwned(); break;
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
      case "fit": mode = "grid"; paintBoard(); fitBoard(); break;
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
    document.body.classList.remove("board-modal-open");
    cancelPlacement();
    if (visible && lastFocusedNode) $(`[data-board-node="${lastFocusedNode}"]`)?.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  boardStore.subscribe(() => {
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
      if (!visible && dialog.open) dialog.close();
      if (visible) {
        syncRoute();
        if (changed && currentCharacter) requestAnimationFrame(fitBoard);
      }
    },
    render(state) {
      appState = state;
      const signature = state.ownedCardIds.join("|");
      if (signature !== ownedSignature) {
        const owned = ownedIds();
        const removed = Object.values(boardStore.getState().boards).some(board => Object.values(board.connectors).some(id => !owned.has(id)));
        ownedSignature = signature;
        cancelPlacement();
        // commit() reconciles against the current ownership before this update.
        if (removed && mutate(current => current)) announce(t("ownershipChanged"));
      }
      if (visible && currentCharacter) paintBoard();
      if (visible && dialog.open) paintPicker();
    },
  };
}
