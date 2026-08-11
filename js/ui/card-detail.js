import { prepareScoreCards } from "../score.js?v=20260811.19";
import {
  ATTRIBUTE_META,
  attributeStyle,
  cleanGameMarkup,
  escapeHtml,
  renderLandscapeCardArt,
  wirePortraitFallback,
} from "./cards.js?v=20260811.19";
import { requiredElement } from "./dom.js?v=20260811.19";

const STAT_LABELS = Object.freeze({ p: "퍼포먼스", t: "테크닉", s: "센스" });

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ko-KR");
}

function skillBlock(title, skill, meta = []) {
  const description = cleanGameMarkup(skill?.description) || "정보 없음";
  return `<article class="card-detail-skill">
    <header><strong>${escapeHtml(title)}</strong><span>Lv${Number(skill?.level) || 1}</span></header>
    ${meta.length ? `<div class="card-detail-skill-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    <p>${escapeHtml(description)}</p>
  </article>`;
}

function renderDetail(card, charactersById, state) {
  const isOwned = state.ownedCardIds.includes(card.id);
  const maxLevel = Math.max(1, ...(card.growth?.levels ?? []).map((row) => Number(row.level) || 1));
  const setting = isOwned
    ? state.ownedCardSettings?.[card.id] ?? { level: maxLevel, potential: 0 }
    : { level: maxLevel, potential: 0 };
  const settings = { [card.id]: setting };
  const current = prepareScoreCards([card], charactersById, settings, { levelMode: "current" }).get(card.id);
  const maximum = prepareScoreCards([card], charactersById, settings, { levelMode: "max" }).get(card.id);
  const attribute = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const profileText = isOwned
    ? `Lv${current.profile.level} · ${current.profile.potential}개화`
    : `미보유 · MAX · 0개화 기준`;
  const statRows = Object.entries(STAT_LABELS).map(([stat, label]) => `
    <div class="card-detail-stat">
      <span>${label}</span>
      <strong>${formatNumber(current.stats[stat])}</strong>
      <small>MAX ${formatNumber(maximum.stats[stat])}</small>
    </div>`).join("");
  const activeMeta = [
    `${current.active.interval}초 주기`,
    `발동률 ${Math.round(current.active.probability * 100)}%`,
    `${current.active.duration}초 지속`,
  ];

  return `<div class="card-detail-layout" style="${attributeStyle(card)}">
    <div class="card-detail-hero">
      <div class="card-detail-art">${renderLandscapeCardArt(card, { lazy: false })}</div>
      <div class="card-detail-identity">
        <span class="card-detail-rarity">★${Number(card.rarity)} · ${escapeHtml(attribute.name)}</span>
        <h3>${escapeHtml(card.character_name)}</h3>
        <p>${escapeHtml(card.name)}</p>
        <strong>${escapeHtml(profileText)}</strong>
      </div>
    </div>
    <section class="card-detail-stats" aria-label="카드 파라미터">${statRows}</section>
    <section class="card-detail-skills">
      ${skillBlock("액티브 스킬", current.active, activeMeta)}
      ${skillBlock("패시브 스킬", current.passive)}
      ${skillBlock("스페셜 스킬", current.special)}
      <article class="card-detail-skill card-detail-leader">
        <header><strong>리더 효과</strong></header>
        <p>${escapeHtml(cleanGameMarkup(current.leader.description) || "정보 없음")}</p>
      </article>
    </section>
  </div>`;
}

export function createCardDetail({ cardsById, charactersById, store }) {
  const modal = requiredElement("#card-detail-modal");
  const dialog = requiredElement(".card-detail-dialog", modal);
  const content = requiredElement("#card-detail-content");
  let activeCardId = null;
  let returnFocus = null;

  function render() {
    if (!activeCardId) return;
    const card = cardsById.get(activeCardId);
    if (!card) return;
    content.innerHTML = renderDetail(card, charactersById, store.getState());
    wirePortraitFallback(content);
  }

  function open(cardId, trigger) {
    if (!cardsById.has(cardId)) return;
    activeCardId = cardId;
    returnFocus = trigger ?? null;
    render();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("card-detail-open");
    window.setTimeout(() => requiredElement("[data-close-card-detail]", dialog).focus(), 0);
  }

  function close() {
    if (!modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("card-detail-open");
    activeCardId = null;
    returnFocus?.focus();
  }

  modal.querySelectorAll("[data-close-card-detail]").forEach((element) => element.addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
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
  });

  return {
    open,
    close,
    refresh() {
      if (modal.classList.contains("is-open")) render();
    },
  };
}
