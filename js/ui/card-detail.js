import { formatNumber, getLocale, t } from "../i18n.js?v=1.3.0";
import { prepareScoreCards } from "../score.js?v=1.3.0";
import {
  ATTRIBUTE_META,
  attributeStyle,
  cleanGameMarkup,
  escapeHtml,
  renderLandscapeCardArt,
  wirePortraitFallback,
} from "./cards.js?v=1.3.0";
import { requiredElement } from "./dom.js?v=1.3.0";

const LOCAL_COPY = Object.freeze({
  ko: {
    unownedProfile: "미보유 · MAX · 개화 0 기준",
    statsAria: "카드 파라미터",
    rate: (value) => `발동률 ${value}%`,
  },
  en: {
    unownedProfile: "Unowned · MAX · Awakening 0",
    statsAria: "Card parameters",
    rate: (value) => `Activation ${value}%`,
  },
  ja: {
    unownedProfile: "未所持 · MAX · 覚醒0基準",
    statsAria: "カードパラメータ",
    rate: (value) => `発動率 ${value}%`,
  },
});

function copy() {
  return LOCAL_COPY[getLocale()] ?? LOCAL_COPY.ko;
}

function statLabels() {
  return {
    p: t("target.performance"),
    t: t("target.technique"),
    s: t("target.sense"),
  };
}

function skillBlock(kind, skill, rate = "") {
  const description = cleanGameMarkup(skill?.description) || t("card.infoNone");
  return `<article class="card-detail-skill card-detail-skill--${kind}">
    <header><strong>${escapeHtml(t(`skill.${kind}`))}</strong>${kind !== "leader" ? `<span>Lv${Number(skill?.level) || 1}</span>` : ""}</header>
    <p>${escapeHtml(description)}${rate ? ` <span class="card-detail-skill-rate">${escapeHtml(rate)}</span>` : ""}</p>
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
    ? `Lv${current.profile.level} · ${t("card.potential")} ${current.profile.potential}`
    : copy().unownedProfile;
  const statRows = Object.entries(statLabels()).map(([stat, label]) => `
    <div class="card-detail-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(Math.round(current.stats[stat]))}</strong>
      ${Math.round(current.stats[stat]) !== Math.round(maximum.stats[stat])
        ? `<small>MAX ${formatNumber(Math.round(maximum.stats[stat]))}</small>` : ""}
    </div>`).join("");

  return `<div class="card-detail-layout" style="${attributeStyle(card)}">
    <div class="card-detail-hero">
      <div class="card-detail-art">${renderLandscapeCardArt(card, { lazy: false, showMeta: false })}</div>
      <div class="card-detail-identity">
        <span class="card-detail-rarity">★${Number(card.rarity)} · ${escapeHtml(attribute.name)}</span>
        <h3>${escapeHtml(card.character_name)}</h3>
        <p>${escapeHtml(card.name)}</p>
        <strong>${escapeHtml(profileText)}</strong>
      </div>
    </div>
    <section class="card-detail-stats" aria-label="${escapeHtml(copy().statsAria)}">${statRows}</section>
    <section class="card-detail-skills">
      ${skillBlock("active", current.active, copy().rate(Math.round(current.active.probability * 100)))}
      ${skillBlock("passive", current.passive)}
      ${skillBlock("special", current.special)}
      ${skillBlock("leader", current.leader)}
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
