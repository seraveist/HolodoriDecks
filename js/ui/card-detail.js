import { formatNumber, getLocale, t } from "../i18n.js?v=20260812.1";
import { prepareScoreCards } from "../score.js?v=20260811.19";
import {
  ATTRIBUTE_META,
  attributeStyle,
  cleanGameMarkup,
  escapeHtml,
  renderLandscapeCardArt,
  wirePortraitFallback,
} from "./cards.js?v=20260813.2";
import { requiredElement } from "./dom.js?v=20260812.1";

const LOCAL_COPY = Object.freeze({
  ko: {
    unownedProfile: "미보유 · MAX · 개화 0 기준",
    statsAria: "카드 파라미터",
    interval: (value) => `${value}초 주기`,
    rate: (value) => `발동률 ${value}%`,
    duration: (value) => `${value}초 지속`,
  },
  en: {
    unownedProfile: "Unowned · MAX · Awakening 0",
    statsAria: "Card parameters",
    interval: (value) => `${value}s cycle`,
    rate: (value) => `Activation ${value}%`,
    duration: (value) => `${value}s duration`,
  },
  ja: {
    unownedProfile: "未所持 · MAX · 覚醒0基準",
    statsAria: "カードパラメータ",
    interval: (value) => `${value}秒周期`,
    rate: (value) => `発動率 ${value}%`,
    duration: (value) => `${value}秒持続`,
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

function skillBlock(title, skill, meta = []) {
  const description = cleanGameMarkup(skill?.description) || t("card.infoNone");
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
    ? `Lv${current.profile.level} · ${t("card.potential")} ${current.profile.potential}`
    : copy().unownedProfile;
  const statRows = Object.entries(statLabels()).map(([stat, label]) => `
    <div class="card-detail-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(Math.round(current.stats[stat]))}</strong>
      <small>MAX ${formatNumber(Math.round(maximum.stats[stat]))}</small>
    </div>`).join("");
  const activeMeta = [
    copy().interval(current.active.interval),
    copy().rate(Math.round(current.active.probability * 100)),
    copy().duration(current.active.duration),
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
    <section class="card-detail-stats" aria-label="${escapeHtml(copy().statsAria)}">${statRows}</section>
    <section class="card-detail-skills">
      ${skillBlock(t("skill.active"), current.active, activeMeta)}
      ${skillBlock(t("skill.passive"), current.passive)}
      ${skillBlock(t("skill.special"), current.special)}
      <article class="card-detail-skill card-detail-leader">
        <header><strong>${t("skill.leader")}</strong></header>
        <p>${escapeHtml(cleanGameMarkup(current.leader.description) || t("card.infoNone"))}</p>
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
