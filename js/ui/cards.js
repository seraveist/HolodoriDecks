export const ATTRIBUTE_META = Object.freeze({
  1: {
    name: "큐트",
    color: "#ef718f",
    soft: "#fdebf0",
    icon: "./assets/ui/type-cute.svg?v=20260811.19",
  },
  2: {
    name: "퓨어",
    color: "#4fb78d",
    soft: "#e9f7f1",
    icon: "./assets/ui/type-pure.svg?v=20260811.19",
  },
  3: {
    name: "해피",
    color: "#f0a33f",
    soft: "#fff3df",
    icon: "./assets/ui/type-happy.svg?v=20260811.19",
  },
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
  return `./assets/cards/${encodeURIComponent(card.id)}.webp`;
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
  const icon = `<img class="attribute-icon" src="${meta.icon}" alt="${meta.name}">`;
  const rarity = `<span class="rarity-badge" aria-label="희귀도 ${card.rarity}">${"★".repeat(Number(card.rarity))}</span>`;

  if (!hasPortrait(card)) {
    return `<div class="card-art" style="${attributeStyle(card)}">${icon}<div class="r3-art"><strong>★3</strong><small>NO IMAGE</small></div></div>`;
  }

  const loading = lazy ? ' loading="lazy"' : "";
  return `<div class="card-art" style="${attributeStyle(card)}">${icon}${rarity}<img data-card-portrait src="${cardPortraitPath(card)}" alt="${escapeHtml(card.character_name)} ${escapeHtml(card.name)}"${loading}></div>`;
}

export function renderLandscapeCardArt(card, { lazy = true, showMeta = true } = {}) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const icon = showMeta ? `<img class="attribute-icon" src="${meta.icon}" alt="${meta.name}">` : "";
  const rarity = showMeta ? `<span class="rarity-badge" aria-label="희귀도 ${card.rarity}">${"★".repeat(Number(card.rarity))}</span>` : "";

  if (!hasPortrait(card)) {
    const placeholder = showMeta
      ? "<div class=\"r3-art\"><strong>★3</strong><small>이미지 없음</small></div>"
      : "<div class=\"r3-art clean-card-art\" role=\"img\" aria-label=\"이미지 없음\"></div>";
    return `<div class="landscape-card-art" style="${attributeStyle(card)}">${icon}${placeholder}</div>`;
  }

  const loading = lazy ? ' loading="lazy"' : "";
  return `<div class="landscape-card-art" style="${attributeStyle(card)}">${icon}${rarity}<img data-card-portrait src="${cardPortraitPath(card)}" alt="${escapeHtml(card.character_name)} ${escapeHtml(card.name)}"${loading}></div>`;
}

export function renderLandscapeCardTitle(card) {
  const meta = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  return `<span class="landscape-card-title"><span class="landscape-card-title-meta"><img class="landscape-card-type-icon" src="${meta.icon}" alt="${escapeHtml(meta.name)} 타입"><small>★${Number(card.rarity)}</small></span><strong>${escapeHtml(card.character_name)}</strong></span>`;
}

export function renderCardCopy(card, className = "slot-card-copy", metaText = "") {
  const meta = metaText ? `<small>${escapeHtml(metaText)}</small>` : "";
  return `<div class="${className}" style="${attributeStyle(card)}"><strong>${escapeHtml(card.character_name)}</strong><span>${escapeHtml(card.name)}</span>${meta}</div>`;
}

export function wirePortraitFallback(container) {
  container.querySelectorAll("[data-card-portrait]").forEach((image) => {
    image.addEventListener("error", () => {
      image.removeAttribute("data-card-portrait");
      image.src = "./assets/ui/card-placeholder.svg";
      image.classList.add("is-fallback");
    }, { once: true });
  });
}

export function latestSkillDescription(skill) {
  const levels = skill?.levels ?? [];
  const description = levels.at(-1)?.description ?? "정보 없음";
  return cleanGameMarkup(description);
}
