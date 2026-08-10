const state = {
  cards: [],
  music: [],
  ui: null,
  slots: [null, null, null, null, null, null],
  activeSlot: null,
  zoom: 1,
};

const slotLabels = ["리더", "멤버 1", "멤버 2", "멤버 3", "멤버 4", "멤버 5"];
const attributeLabels = { 1: "큐트", 2: "퓨어", 3: "해피" };
const fallbackUi = {
  attributes: {
    1: { label_ko: "큐트", icon: "assets/ui/type-cute.svg" },
    2: { label_ko: "퓨어", icon: "assets/ui/type-pure.svg" },
    3: { label_ko: "해피", icon: "assets/ui/type-happy.svg" },
  },
  score_ranks: {
    D: "assets/ui/rank-d.svg",
    C: "assets/ui/rank-c.svg",
    B: "assets/ui/rank-b.svg",
    A: "assets/ui/rank-a.svg",
    S: "assets/ui/rank-s.svg",
  },
  placeholders: { card: "assets/ui/card-placeholder.svg" },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function portraitPath(card) {
  if (!card || ![4, 5].includes(Number(card.rarity))) return null;
  return `assets/cards/${card.id}.webp`;
}

function typeIcon(card) {
  return state.ui?.attributes?.[String(card.attribute)]?.icon
    || fallbackUi.attributes[card.attribute]?.icon
    || "";
}

function cardMediaHtml(card, compact = false) {
  if (!card) {
    return `<div class="slot-empty"><b>＋</b><span>카드 선택</span></div>`;
  }

  const icon = typeIcon(card);
  const type = attributeLabels[card.attribute] || "타입";
  const iconHtml = icon
    ? `<img class="slot-type-icon" src="${escapeHtml(icon)}" alt="${escapeHtml(type)}">`
    : "";

  if (Number(card.rarity) === 3) {
    return `${iconHtml}<div class="slot-r3">★3</div>`;
  }

  const path = portraitPath(card);
  const fallback = state.ui?.placeholders?.card || fallbackUi.placeholders.card;
  return `${iconHtml}<img class="card-photo" loading="lazy" src="${escapeHtml(path)}" alt="${escapeHtml(card.character_name)}" onerror="this.onerror=null;this.src='${escapeHtml(fallback)}'">`;
}

function renderMemberSlots() {
  const root = $("#member-slots");
  root.innerHTML = state.slots.map((card, index) => {
    const isLeader = index === 0;
    return `
      <button class="member-slot${isLeader ? " is-leader" : ""}" type="button" data-slot="${index}">
        <div class="slot-label">
          <span>${slotLabels[index]}</span>
          <i class="slot-dot"></i>
        </div>
        <div class="slot-media">${cardMediaHtml(card)}</div>
        <div class="slot-body">
          <strong>${card ? escapeHtml(card.character_name) : "빈 슬롯"}</strong>
          <span>${card ? `★${card.rarity} · ${escapeHtml(attributeLabels[card.attribute] || "-")} · ${escapeHtml(card.name)}` : "클릭해서 카드를 선택하세요"}</span>
        </div>
      </button>`;
  }).join("");

  $$(".member-slot").forEach((button) => {
    button.addEventListener("click", () => openCardModal(Number(button.dataset.slot)));
  });

  renderResultMembers();
  renderSkillInfo();
  renderStatusBadges();
}

function renderResultMembers() {
  const root = $("#result-members");
  root.innerHTML = state.slots.map((card, index) => `
    <article class="result-card${index === 0 ? " is-leader" : ""}">
      <div class="result-card-media">${card ? cardMediaHtml(card, true) : `<div class="slot-empty"><span>미선택</span></div>`}</div>
      <div class="result-card-copy">
        <b>${slotLabels[index]}</b>
        <strong>${card ? escapeHtml(card.character_name) : "미선택"}</strong>
        <span>${card ? `★${card.rarity} · ${escapeHtml(card.name)}` : "-"}</span>
      </div>
    </article>`).join("");

  root.style.transform = `scale(${state.zoom})`;
  root.style.marginBottom = `${Math.max(0, (state.zoom - 1) * 120)}px`;
}

function renderStatusBadges() {
  const selectedCount = state.slots.filter(Boolean).length;
  const leaderReady = Boolean(state.slots[0]);
  const musicReady = Boolean($("#music-select")?.value);
  const root = $(".result-badges");
  root.innerHTML = `
    <span>편성 ${selectedCount}/6</span>
    <span>리더 ${leaderReady ? "선택" : "미선택"}</span>
    <span>악곡 ${musicReady ? "선택" : "미선택"}</span>`;
}

function firstSkillDescription(card, kind) {
  const levels = card?.skills?.[kind]?.levels || [];
  return levels[0]?.description || "";
}

function renderSkillInfo() {
  const root = $("#skill-info");
  const selected = state.slots
    .map((card, index) => ({ card, index }))
    .filter((item) => item.card);

  if (!selected.length) {
    root.innerHTML = `<p class="empty-copy">멤버를 선택하면 스킬 정보가 여기에 표시됩니다.</p>`;
    return;
  }

  const detailed = $("#result-view-mode")?.value === "detail";
  const rows = [];

  selected.forEach(({ card, index }) => {
    if (index === 0 && card.leader?.description) {
      rows.push({
        label: `${slotLabels[index]} · 리더`,
        text: card.leader.description,
      });
    }

    const active = firstSkillDescription(card, "active");
    if (active) rows.push({ label: `${slotLabels[index]} · 액티브`, text: active });

    if (detailed) {
      const passive = firstSkillDescription(card, "passive");
      const special = firstSkillDescription(card, "special");
      if (passive) rows.push({ label: `${slotLabels[index]} · 패시브`, text: passive });
      if (special) rows.push({ label: `${slotLabels[index]} · 스페셜`, text: special });
    }
  });

  root.innerHTML = rows.length
    ? rows.map((row) => `
        <div class="skill-row">
          <strong>${escapeHtml(row.label)}</strong>
          <p>${escapeHtml(row.text)}</p>
        </div>`).join("")
    : `<p class="empty-copy">표시할 스킬 설명이 없습니다.</p>`;
}

function openCardModal(slotIndex) {
  state.activeSlot = slotIndex;
  $("#card-modal-slot").textContent = slotLabels[slotIndex];
  $("#card-modal-title").textContent = `${slotLabels[slotIndex]} 카드 선택`;
  $("#card-search").value = "";
  $("#rarity-filter").value = "all";
  $("#attribute-filter").value = "all";
  $("#card-sort").value = "order";
  renderCardList();

  const modal = $("#card-modal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => $("#card-search").focus());
}

function closeCardModal() {
  const modal = $("#card-modal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  state.activeSlot = null;
}

function filteredCards() {
  const query = $("#card-search").value.trim().toLocaleLowerCase("ko-KR");
  const rarity = $("#rarity-filter").value;
  const attribute = $("#attribute-filter").value;
  const sort = $("#card-sort").value;

  const items = state.cards.filter((card) => {
    const haystack = `${card.character_name || ""} ${card.name || ""}`.toLocaleLowerCase("ko-KR");
    if (query && !haystack.includes(query)) return false;
    if (rarity !== "all" && String(card.rarity) !== rarity) return false;
    if (attribute !== "all" && String(card.attribute) !== attribute) return false;
    return true;
  });

  const byOrder = (a, b) => (Number(a.order) || 999999999) - (Number(b.order) || 999999999) || a.id.localeCompare(b.id);

  items.sort((a, b) => {
    if (sort === "rarity-desc") return Number(b.rarity) - Number(a.rarity) || byOrder(a, b);
    if (sort === "character") return String(a.character_name || "").localeCompare(String(b.character_name || ""), "ko") || byOrder(a, b);
    if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ko") || byOrder(a, b);
    return byOrder(a, b);
  });

  return items;
}

function renderCardList() {
  const cards = filteredCards();
  $("#filtered-card-count").textContent = cards.length.toLocaleString("ko-KR");
  const root = $("#card-list");

  const clearItem = `
    <button class="card-item" type="button" data-card-id="">
      <div class="card-item-media"><div class="slot-empty"><b>×</b><span>선택 해제</span></div></div>
      <div class="card-copy"><strong>빈 슬롯으로</strong><span>현재 선택을 지웁니다</span></div>
    </button>`;

  root.innerHTML = clearItem + cards.map((card) => `
    <button class="card-item" type="button" data-card-id="${escapeHtml(card.id)}">
      <div class="card-item-media">
        ${cardMediaHtml(card)}
        <span class="card-rarity">★${card.rarity}</span>
      </div>
      <div class="card-copy">
        <strong>${escapeHtml(card.character_name)}</strong>
        <span>${escapeHtml(card.name)} · ${escapeHtml(attributeLabels[card.attribute] || "-")}</span>
      </div>
    </button>`).join("");

  $$("#card-list .card-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.activeSlot === null) return;
      const cardId = button.dataset.cardId;
      state.slots[state.activeSlot] = cardId
        ? state.cards.find((card) => card.id === cardId) || null
        : null;
      closeCardModal();
      renderMemberSlots();
    });
  });
}

function populateMusic() {
  const select = $("#music-select");
  const items = [...state.music].sort((a, b) => (Number(a.order) || 999999999) - (Number(b.order) || 999999999) || a.id.localeCompare(b.id));
  select.innerHTML = `<option value="">악곡 선택</option>` + items.map((track) => {
    const singer = track.singer_name ? ` · ${track.singer_name}` : "";
    return `<option value="${escapeHtml(track.id)}">${escapeHtml(track.title)}${escapeHtml(singer)}</option>`;
  }).join("");
}

function syncTargetResult() {
  const rank = $("#target-rank").value;
  const score = Number($("#target-score").value || 0);
  $("#result-rank-text").textContent = rank;
  $("#result-score-text").textContent = score.toLocaleString("ko-KR");
  $("#result-rank-icon").src = state.ui?.score_ranks?.[rank] || fallbackUi.score_ranks[rank];
  $("#result-rank-icon").alt = `${rank} 랭크`;
}

function syncMusicResult() {
  const id = $("#music-select").value;
  const track = state.music.find((item) => item.id === id);
  $("#result-song-name").textContent = track?.title || "미선택";
  $("#result-song-difficulty").textContent = $("#difficulty-select").value;
  renderStatusBadges();
}

function changeZoom(delta) {
  state.zoom = Math.min(1.2, Math.max(.8, Math.round((state.zoom + delta) * 10) / 10));
  $("#zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
  renderResultMembers();
}

function bindEvents() {
  ["#card-search", "#rarity-filter", "#attribute-filter", "#card-sort"].forEach((selector) => {
    $(selector).addEventListener(selector === "#card-search" ? "input" : "change", renderCardList);
  });

  $$('[data-close-modal]').forEach((node) => node.addEventListener("click", closeCardModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#card-modal").classList.contains("is-open")) closeCardModal();
  });

  $("#target-rank").addEventListener("change", syncTargetResult);
  $("#target-score").addEventListener("change", syncTargetResult);
  $("#result-view-mode").addEventListener("change", renderSkillInfo);
  $("#music-select").addEventListener("change", syncMusicResult);
  $("#difficulty-select").addEventListener("change", syncMusicResult);
  $("#zoom-out").addEventListener("click", () => changeZoom(-.1));
  $("#zoom-in").addEventListener("click", () => changeZoom(.1));
}

async function loadData() {
  const [cardsResponse, musicResponse, uiResponse] = await Promise.all([
    fetch("data/generated/cards.json"),
    fetch("data/generated/music.json"),
    fetch("assets/ui/manifest.json"),
  ]);

  if (!cardsResponse.ok) throw new Error("cards.json 로드 실패");
  if (!musicResponse.ok) throw new Error("music.json 로드 실패");

  state.cards = await cardsResponse.json();
  state.music = await musicResponse.json();
  state.ui = uiResponse.ok ? await uiResponse.json() : fallbackUi;
}

async function init() {
  bindEvents();
  renderMemberSlots();
  syncTargetResult();

  try {
    await loadData();
    populateMusic();
    renderMemberSlots();
    syncTargetResult();
    syncMusicResult();
  } catch (error) {
    console.error(error);
    $("#music-select").innerHTML = `<option value="">데이터 로드 실패</option>`;
    $("#member-slots").insertAdjacentHTML("beforebegin", `<p class="empty-copy">카드 데이터를 불러오지 못했습니다. GitHub Pages 또는 HTTP 서버에서 열어주세요.</p>`);
  }
}

init();
