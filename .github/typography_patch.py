from pathlib import Path
import re

# Shared typography tokens.
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

# Let OS/browser choose native smoothing behavior.
p = Path('css/base.css')
text = p.read_text(encoding='utf-8').replace('  -webkit-font-smoothing: antialiased;\n', '')
p.write_text(text, encoding='utf-8')

# Normalize tiny text and heavy 900 weight across UI sheets.
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

typography = ''':root {
  font-variant-numeric: tabular-nums;
}

body {
  font-synthesis: none;
  text-rendering: auto;
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

/* One semantic type scale for every card surface. */
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

/* Result hierarchy */
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

/* Readable diagnostics/detail labels. */
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
  .result-summary-score strong {
    font-size: 22px;
  }

  .rank-lockup strong {
    font-size: 25px;
  }

  /* Card text hierarchy intentionally remains identical on mobile. */
  .card-copy-character { font-size: var(--type-card-title) !important; }
  .card-copy-name { font-size: var(--type-card-name) !important; }
  .card-copy-meta,
  .card-copy-rarity { font-size: var(--type-card-meta) !important; }
}
'''
Path('css/typography.css').write_text(typography, encoding='utf-8')

# Font CSS + canonical type layer, with theme remaining final.
p = Path('styles.css')
imports = p.read_text(encoding='utf-8').splitlines()
font_import = '@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css");'
type_import = '@import url("./css/typography.css?v=20260813.1");'
imports = [line for line in imports if 'typography.css' not in line and 'pretendardvariable' not in line]
imports.insert(0, font_import)
theme_index = next((i for i, line in enumerate(imports) if 'theme.css' in line), len(imports))
imports.insert(theme_index, type_import)
p.write_text('\n'.join(imports) + '\n', encoding='utf-8')

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

# Bust cards module URL everywhere it is used.
for p in Path('js/ui').glob('*.js'):
    text = p.read_text(encoding='utf-8')
    text = re.sub(r'\.\/cards\.js\?v=[^"]+', './cards.js?v=20260813.2', text)
    p.write_text(text, encoding='utf-8')

p = Path('js/app.js')
text = p.read_text(encoding='utf-8')
for module in ('member', 'modal', 'owned', 'result'):
    text = re.sub(rf'\.\/ui\/{module}\.js\?v=[^"]+', f'./ui/{module}.js?v=20260813.2', text, count=1)
p.write_text(text, encoding='utf-8')

# Root cache busts; internal APP_VERSION stays pinned for existing compatibility checks.
p = Path('index.html')
text = p.read_text(encoding='utf-8')
text = text.replace('styles.css?v=20260812.5', 'styles.css?v=20260813.1', 1)
text = text.replace('./js/app.js?v=20260813.1', './js/app.js?v=20260813.2', 1)
p.write_text(text, encoding='utf-8')

# CI validates the new typography layer and new CSS cache key.
for workflow in (Path('.github/workflows/validate.yml'), Path('.github/workflows/pages.yml')):
    text = workflow.read_text(encoding='utf-8')
    text = text.replace("'css/tweaks.css']", "'css/tweaks.css', 'css/typography.css']")
    text = text.replace('styles.css?v=20260812.5', 'styles.css?v=20260813.1')
    workflow.write_text(text, encoding='utf-8')
