from pathlib import Path
import re

# Shared typography tokens in the base token sheet for maintainability.
p = Path('css/tokens.css')
text = p.read_text(encoding='utf-8')
old_font = '  --font-sans: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;\n'
new_font = '''  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
  --type-caption: 10px;
  --type-label: 11px;
  --type-body-sm: 12px;
  --type-body: 13px;
  --type-card-title: 13px;
  --type-card-name: 11px;
  --type-card-meta: 10px;
  --type-heading-sm: 16px;
  --type-heading-md: 20px;
  --type-heading-lg: 21px;
  --type-score-md: 21px;
  --type-score-lg: 28px;
  --type-score-xl: 30px;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-extrabold: 800;
  --tracking-tight: -0.015em;
'''
if old_font not in text:
    raise SystemExit('font token marker not found')
text = text.replace(old_font, new_font, 1)
p.write_text(text, encoding='utf-8')

# Let native rasterizers choose their own smoothing strategy.
p = Path('css/base.css')
text = p.read_text(encoding='utf-8').replace('  -webkit-font-smoothing: antialiased;\n', '')
p.write_text(text, encoding='utf-8')

# Normalize tiny text and the old 900-weight pattern across UI styles.
for p in Path('css').glob('*.css'):
    if p.name in {'tokens.css', 'theme.css'}:
        continue
    text = p.read_text(encoding='utf-8')
    text = text.replace('font-size: 9px;', 'font-size: var(--type-caption);')
    text = text.replace('font-size: 10px;', 'font-size: var(--type-caption);')
    text = text.replace('font-size: 11px;', 'font-size: var(--type-label);')
    text = text.replace('font-size: 12px;', 'font-size: var(--type-body-sm);')
    text = text.replace('font-size: 13px;', 'font-size: var(--type-body);')
    text = text.replace('font-weight: 900;', 'font-weight: var(--weight-extrabold);')
    p.write_text(text, encoding='utf-8')

# This final typography sheet is also self-contained so a cached older styles.css
# cannot hide the new type variables after deployment.
typography = ''':root {
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
  --type-caption: 10px;
  --type-label: 11px;
  --type-body-sm: 12px;
  --type-body: 13px;
  --type-card-title: 13px;
  --type-card-name: 11px;
  --type-card-meta: 10px;
  --type-heading-sm: 16px;
  --type-heading-md: 20px;
  --type-heading-lg: 21px;
  --type-score-md: 21px;
  --type-score-lg: 28px;
  --type-score-xl: 30px;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-extrabold: 800;
  --tracking-tight: -0.015em;
  font-variant-numeric: tabular-nums;
}

body {
  font-family: var(--font-sans);
  font-synthesis: none;
  text-rendering: auto;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
}

button,
input,
select,
textarea {
  font-family: var(--font-sans);
}

/* Core hierarchy */
.app-header h1,
.modal-header h2 {
  font-weight: var(--weight-extrabold);
  letter-spacing: var(--tracking-tight);
}

.section-heading h2 {
  font-size: var(--type-heading-lg);
  font-weight: var(--weight-extrabold);
  letter-spacing: var(--tracking-tight);
}

.field > span,
.calculate-row output,
.preset-guide,
.preset-status,
.picker-summary,
.owned-summary span,
.timeline-head-note {
  font-weight: var(--weight-bold);
}

.field select,
.search-field input,
.language-picker select {
  font-weight: var(--weight-semibold);
}

.primary-button,
.owned-transfer-button,
.text-button,
.member-separate-toggle {
  font-weight: var(--weight-extrabold);
}

/* One semantic type scale for preset, picker, owned-list, and result cards. */
.card-copy-character {
  min-width: 0;
  font-size: var(--type-card-title) !important;
  font-weight: var(--weight-bold) !important;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.card-copy-name {
  font-size: var(--type-card-name) !important;
  font-weight: var(--weight-medium) !important;
  line-height: 1.35;
  letter-spacing: 0;
}

.card-copy-meta,
.card-copy-rarity {
  font-size: var(--type-card-meta) !important;
  line-height: 1.35;
}

.card-copy-meta {
  font-weight: var(--weight-semibold) !important;
}

.card-copy-rarity {
  font-weight: var(--weight-bold) !important;
}

.slot-role,
.owned-check,
.used-chip,
.result-card-role,
.result-card-attribute {
  font-size: var(--type-caption);
  font-weight: var(--weight-extrabold);
}

/* Summary/result hierarchy */
.result-top-number {
  font-size: var(--type-body-sm);
  font-weight: var(--weight-extrabold);
  letter-spacing: 0.04em;
}

.result-summary-score span {
  font-size: var(--type-label);
  font-weight: var(--weight-bold);
}

.result-summary-score small,
.result-metric span,
.card-detail-stat small,
.card-detail-skill-meta span,
.diagnostic-timeline-scale > div {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
}

.result-summary-score strong {
  font-size: var(--type-score-lg);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
}

.rank-lockup strong {
  font-size: var(--type-score-xl);
  font-weight: var(--weight-bold);
  letter-spacing: -0.02em;
}

.song-projection > div strong {
  font-size: var(--type-score-md);
  font-weight: var(--weight-bold);
}

.result-summary-members strong,
.calculation-card header span,
.calculation-card header strong,
.result-metric strong {
  font-weight: var(--weight-bold);
}

/* Detail/diagnostic labels remain readable without any 9px text. */
.diagnostic-table th,
.diagnostic-member-trigger strong,
.diagnostic-member-meta,
.diagnostic-leader-badge,
.diag-interval,
.diag-ok,
.diag-off,
.diagnostic-timeline-columns,
.diagnostic-timeline-row strong,
.diagnostic-timeline-row > span,
.card-detail-rarity,
.card-detail-skill header span,
.card-detail-skill-meta span,
.owned-card-settings span {
  font-weight: var(--weight-bold);
}

.special-skill-order li span,
.song-projection-accuracy {
  font-size: var(--type-body-sm);
}

@media (max-width: 600px) {
  .result-summary-score strong { font-size: 22px; }
  .rank-lockup strong { font-size: 25px; }

  /* Card hierarchy intentionally stays identical on mobile. */
  .card-copy-character { font-size: var(--type-card-title) !important; }
  .card-copy-name { font-size: var(--type-card-name) !important; }
  .card-copy-meta,
  .card-copy-rarity { font-size: var(--type-card-meta) !important; }
}
'''
Path('css/typography.css').write_text(typography, encoding='utf-8')

# Shared semantic card classes.
p = Path('js/ui/cards.js')
text = p.read_text(encoding='utf-8')
text = text.replace(
    '<span class="landscape-card-title"><span class="landscape-card-title-meta"><img class="landscape-card-type-icon"',
    '<span class="landscape-card-title card-copy-title"><span class="landscape-card-title-meta card-copy-title-meta"><img class="landscape-card-type-icon"',
    1,
)
text = text.replace(
    '<small>★${Number(card.rarity)}</small></span><strong>${escapeHtml(card.character_name)}</strong>',
    '<small class="card-copy-rarity">★${Number(card.rarity)}</small></span><strong class="card-copy-character">${escapeHtml(card.character_name)}</strong>',
    1,
)
text = text.replace(
    'const meta = metaText ? `<small>${escapeHtml(metaText)}</small>` : "";',
    'const meta = metaText ? `<small class="card-copy-meta">${escapeHtml(metaText)}</small>` : "";',
    1,
)
text = text.replace(
    'return `<div class="${className}" style="${attributeStyle(card)}"><strong>${escapeHtml(card.character_name)}</strong><span>${escapeHtml(card.name || t("card.noName"))}</span>${meta}</div>`;',
    'return `<div class="${className} card-copy" style="${attributeStyle(card)}"><strong class="card-copy-character">${escapeHtml(card.character_name)}</strong><span class="card-copy-name">${escapeHtml(card.name || t("card.noName"))}</span>${meta}</div>`;',
    1,
)
p.write_text(text, encoding='utf-8')

p = Path('js/ui/modal.js')
text = p.read_text(encoding='utf-8')
text = text.replace(
    '<span>${escapeHtml(card.name)}</span>\n            <small>Lv${Number(setting.level) || "-"} · ${t("card.potential")} ${Number(setting.potential) || 0}</small>',
    '<span class="card-copy-name">${escapeHtml(card.name)}</span>\n            <small class="card-copy-meta">Lv${Number(setting.level) || "-"} · ${t("card.potential")} ${Number(setting.potential) || 0}</small>',
    1,
)
p.write_text(text, encoding='utf-8')

p = Path('js/ui/owned.js')
text = p.read_text(encoding='utf-8')
text = text.replace(
    '<span>${escapeHtml(card.name)}</span>\n              ${isOwned ? `<small>Lv${setting.level} · ${t("card.potential")} ${setting.potential}</small>` : ""}',
    '<span class="card-copy-name">${escapeHtml(card.name)}</span>\n              ${isOwned ? `<small class="card-copy-meta">Lv${setting.level} · ${t("card.potential")} ${setting.potential}</small>` : ""}',
    1,
)
p.write_text(text, encoding='utf-8')

p = Path('js/ui/result.js')
text = p.read_text(encoding='utf-8')
text = text.replace('class="result-card-level"', 'class="result-card-level card-copy-meta"', 1)
text = text.replace('class="result-card-rarity"', 'class="result-card-rarity card-copy-rarity"', 1)
text = text.replace('class="result-card-character"', 'class="result-card-character card-copy-character"', 1)
text = text.replace('class="result-card-name"', 'class="result-card-name card-copy-name"', 1)
p.write_text(text, encoding='utf-8')

# Bust the shared cards module everywhere it is consumed.
for p in Path('js/ui').glob('*.js'):
    text = p.read_text(encoding='utf-8')
    text = re.sub(r'\.\/cards\.js\?v=[^"]+', './cards.js?v=20260813.2', text)
    p.write_text(text, encoding='utf-8')

p = Path('js/app.js')
text = p.read_text(encoding='utf-8')
for module in ('member', 'modal', 'owned', 'result'):
    text = re.sub(rf'\.\/ui\/{module}\.js\?v=[^"]+', f'./ui/{module}.js?v=20260813.2', text, count=1)
p.write_text(text, encoding='utf-8')

# Load the official variable dynamic subset and the new final typography layer
# directly from HTML. This gives both resources a fresh cache key without
# changing the pinned root styles.css URL used by existing CI.
p = Path('index.html')
text = p.read_text(encoding='utf-8')
old_links = '  <link rel="stylesheet" href="./styles.css?v=20260812.5">\n  <link rel="stylesheet" href="./css/chart-timeline.css?v=20260812.4">\n'
new_links = '  <link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">\n  <link rel="stylesheet" href="./styles.css?v=20260812.5">\n  <link rel="stylesheet" href="./css/chart-timeline.css?v=20260812.4">\n  <link rel="stylesheet" href="./css/typography.css?v=20260813.1">\n'
if old_links not in text:
    raise SystemExit('index stylesheet marker not found')
text = text.replace(old_links, new_links, 1)
text = text.replace('./js/app.js?v=20260813.1', './js/app.js?v=20260813.2', 1)
p.write_text(text, encoding='utf-8')
