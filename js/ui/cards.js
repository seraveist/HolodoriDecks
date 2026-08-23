import { t } from "../i18n.js?v=20260812.1";

export const ATTRIBUTE_META = Object.freeze({
  1: Object.freeze({
    get name() { return t("attribute.cute"); },
    color: "#ef718f",
    soft: "#fdebf0",
    icon: "./assets/ui/type-cute.svg?v=20260812.1",
  }),
  2: Object.freeze({
    get name() { return t("attribute.pure"); },
    color: "#4fb78d",
    soft: "#e9f7f1",
    icon: "./assets/ui/type-pure.svg?v=20260812.1",
  }),
  3: Object.freeze({
    get name() { return t("attribute.happy"); },
    color: "#f0a33f",
    soft: "#fff3df",
    icon: "./assets/ui/type-happy.svg?v=20260812.1",
  }),
});

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function cleanGameMarkup(value) {
  return String(value ?? "")
    .replace(/\[\/?[a-z][a-z0-9_-]*(?:=[^\]]+)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cardPortraitPath(card) {
  const revision = document.documentElement.dataset.cardAssetRevision?.trim();
  const query = revision ? `?v=${encodeURIComponent(revision)}` : "";
  return `./assets/cards/${encodeURIComponent(card.id)}.webp${query}`;
}

export function hasPortrait(card) {
  return [4, 5].includes(Number(card.rarity));
}

export function attributeStyle(card) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  return `--attribute-color:${meta.color};--attribute-soft:${meta.soft}`;
}

export function renderCardArt(card, { lazy = true } = {}) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const icon = `<img class="attribute-icon" src="${meta.icon}" alt="${escapeHtml(meta.name)}">`;
  const rarity = `<span class="rarity-badge" aria-label="${escapeHtml(t("card.rarityAria", { rarity: card.rarity }))}">${"★".repeat(Number(card.rarity))}</span>`;

  if (!hasPortrait(card)) {
    return `<div class="card-art" style="${attributeStyle(card)}">${icon}<div class="r3-art"><strong>★3</strong><small>NO IMAGE</small></div></div>`;
  }

  const loading = lazy ? ' loading="lazy"' : "";
  return `<div class="card-art" style="${attributeStyle(card)}">${icon}${rarity}<img data-card-portrait src="${cardPortraitPath(card)}" alt="${escapeHtml(card.character_name)} ${escapeHtml(card.name)}"${loading}></div>`;
}

export function renderLandscapeCardArt(card, { lazy = true, showMeta = true } = {}) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const icon = showMeta ? `<img class="attribute-icon" src="${meta.icon}" alt="${escapeHtml(meta.name)}">` : "";
  const rarity = showMeta
    ? `<span class="rarity-badge" aria-label="${escapeHtml(t("card.rarityAria", { rarity: card.rarity }))}">${"★".repeat(Number(card.rarity))}</span>`
    : "";

  if (!hasPortrait(card)) {
    const noImage = escapeHtml(t("card.noImage"));
    const placeholder = showMeta
      ? `<div class="r3-art"><strong>★3</strong><small>${noImage}</small></div>`
      : `<div class="r3-art clean-card-art" role="img" aria-label="${noImage}"></div>`;
    return `<div class="landscape-card-art" style="${attributeStyle(card)}">${icon}${placeholder}</div>`;
  }

  const loading = lazy ? ' loading="lazy"' : "";
  return `<div class="landscape-card-art" style="${attributeStyle(card)}">${icon}${rarity}<img data-card-portrait src="${cardPortraitPath(card)}" alt="${escapeHtml(card.character_name)} ${escapeHtml(card.name)}"${loading}></div>`;
}

export function renderLandscapeCardTitle(card) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  return `<span class="landscape-card-title card-copy-title"><span class="landscape-card-title-meta card-copy-title-meta"><img class="landscape-card-type-icon" src="${meta.icon}" alt="${escapeHtml(t("card.typeAria", { type: meta.name }))}"><small class="card-copy-rarity">★${Number(card.rarity)}</small></span><strong class="card-copy-character">${escapeHtml(card.character_name)}</strong></span>`;
}

export function renderCardCopy(card, className = "slot-card-copy", metaText = "") {
  const meta = metaText ? `<small class="card-copy-meta">${escapeHtml(metaText)}</small>` : "";
  return `<div class="${className} card-copy" style="${attributeStyle(card)}"><strong class="card-copy-character">${escapeHtml(card.character_name)}</strong><span class="card-copy-name">${escapeHtml(card.name || t("card.noName"))}</span>${meta}</div>`;
}

export function wirePortraitFallback(container) {
  container.querySelectorAll("[data-card-portrait]").forEach((image) => {
    image.addEventListener("error", () => {
      image.removeAttribute("data-card-portrait");
      image.src = "./assets/ui/card-placeholder.svg?v=20260812.1";
      image.classList.add("is-fallback");
    }, { once: true });
  });
}

export function latestSkillDescription(skill) {
  const levels = skill?.levels ?? [];
  const description = levels.at(-1)?.description ?? t("card.infoNone");
  return cleanGameMarkup(description);
}
