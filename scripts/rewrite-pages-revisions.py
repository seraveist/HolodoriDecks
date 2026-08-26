#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from holodori_decksim.music_search import build_music_search_index

HTML_REVISION_RE = re.compile(r'(<html\b[^>]*\bdata-card-asset-revision=")[^"]*(")')
HTML_TAG_RE = re.compile(r'(<html\b[^>]*)(>)')
APP_SCRIPT_RE = re.compile(r'(src="\./js/app\.js)(?:\?v=[^"]+)?(")')
STYLESHEET_RE = re.compile(r'(href="\./styles\.css)(?:\?v=[^"]+)?(")')
JS_RELATIVE_REF_RE = re.compile(
    r'((?:\.\.?/)+[^"\'\s?]+\.js)(?:\?v=[^"\'\s]+)?(?=["\'])'
)


def rewrite_index(index: str, revision: str) -> str:
    if HTML_REVISION_RE.search(index):
        index = HTML_REVISION_RE.sub(rf'\1{revision}\2', index, count=1)
    else:
        index, count = HTML_TAG_RE.subn(
            rf'\1 data-card-asset-revision="{revision}"\2',
            index,
            count=1,
        )
        if count != 1:
            raise ValueError('index.html is missing an <html> tag')

    index, count = APP_SCRIPT_RE.subn(rf'\1?v={revision}\2', index, count=1)
    if count != 1:
        raise ValueError('index.html is missing the ./js/app.js module script')
    index = STYLESHEET_RE.sub(rf'\1?v={revision}\2', index, count=1)
    return index


def rewrite_js_references(text: str, revision: str) -> str:
    return JS_RELATIVE_REF_RE.sub(lambda match: f'{match.group(1)}?v={revision}', text)


def build_deployed_music_search(root: Path) -> None:
    generated = root / 'data' / 'generated'
    i18n = generated / 'i18n'
    music = json.loads((generated / 'music.json').read_text(encoding='utf-8'))
    packs = {
        locale: json.loads((i18n / f'{locale}.json').read_text(encoding='utf-8'))
        for locale in ('ko', 'en', 'ja')
    }
    payload = build_music_search_index(music, packs)
    (generated / 'music-search.json').write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def rewrite_site(root: Path, revision: str) -> None:
    index_path = root / 'index.html'
    index_path.write_text(
        rewrite_index(index_path.read_text(encoding='utf-8'), revision),
        encoding='utf-8',
    )

    js_root = root / 'js'
    for path in js_root.rglob('*.js'):
        original = path.read_text(encoding='utf-8')
        rewritten = rewrite_js_references(original, revision)
        path.write_text(rewritten, encoding='utf-8')

    build_deployed_music_search(root)

    deployed_index = index_path.read_text(encoding='utf-8')
    if f'data-card-asset-revision="{revision}"' not in deployed_index:
        raise RuntimeError('card asset revision was not injected')
    if f'./js/app.js?v={revision}' not in deployed_index:
        raise RuntimeError('app module revision was not injected')
    if f'./styles.css?v={revision}' not in deployed_index:
        raise RuntimeError('stylesheet revision was not injected')

    cards = (js_root / 'ui/cards.js').read_text(encoding='utf-8')
    if 'dataset.cardAssetRevision' not in cards:
        raise RuntimeError('card portrait cache-busting hook missing')

    data_js = (js_root / 'data.js').read_text(encoding='utf-8')
    required_json_paths = [
        '../data/generated/manifest.json',
        '../data/generated/cards.json',
        '../data/generated/characters.json',
        '../data/generated/music.json',
        '../data/generated/music-search.json',
        '../data/generated/master_refs.json',
    ]
    for path in required_json_paths:
        if path not in data_js:
            raise RuntimeError(f'JSON data path was corrupted during revision rewrite: {path}')
    if 'manifest.js?v=' in data_js or 'cards.js?v=' in data_js:
        raise RuntimeError('JSON filename was incorrectly rewritten as JavaScript')

    search_index = json.loads((root / 'data' / 'generated' / 'music-search.json').read_text(encoding='utf-8'))
    if not search_index.get('items') or search_index.get('music_count') != len(search_index['items']):
        raise RuntimeError('music search index is missing or inconsistent')


def main() -> int:
    parser = argparse.ArgumentParser(description='Inject deployment revisions into the Pages artifact')
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()

    revision = args.revision.strip()
    if not revision:
        parser.error('--revision must not be empty')

    rewrite_site(args.root, revision)
    print(f'[pages] static asset revision injected: {revision}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
