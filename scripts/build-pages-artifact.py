#!/usr/bin/env python3
"""Build the same validated public artifact in CI and Pages."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

REPOSITORY = Path(__file__).resolve().parents[1]


def validate_derived_data(root: Path) -> None:
    generated = root / 'data/generated'
    def read(name):
        return json.loads((generated / name).read_text(encoding='utf-8'))
    manifest = read('i18n/manifest.json')
    if (not manifest.get('required_entry_count')
        or type(manifest.get('card_name_alias_count')) is not int
        or manifest['card_name_alias_count'] < 0
        or set(manifest.get('locales', {})) != {'ko', 'en', 'ja'}):
        raise ValueError('Invalid locale manifest')
    chart, runtime = read('chart-index.json'), read('exact-runtime-index.json')
    if (runtime.get('runtimeExactCount') != len(runtime.get('charts', {}))
        or runtime.get('currentMasterSourceCommit') != chart.get('source_commit')
        or runtime.get('currentMasterChartCount') != chart.get('chart_count')
        or not re.fullmatch(r'[0-9a-f]{64}', str(runtime.get('source', {}).get('sha256', '')))):
        raise ValueError('Invalid or stale Runtime Exact index')


def build(root: Path, revision: str, *, repository=REPOSITORY) -> None:
    root, repository = root.resolve(), repository.resolve()
    # Never overwrite a source tree or mix a previous artifact with new inputs.
    inputs = ['css', 'js', 'src', 'tests', 'scripts', 'analysis', 'data', 'assets', '.github', '.git']
    if (root == repository or repository.is_relative_to(root)
        or any(root.is_relative_to(repository / name) for name in inputs)
        or (root.exists() and any(root.iterdir()))):
        raise ValueError('Build into a new, empty artifact directory')
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Artifact revision must be a commit SHA')
    def run(*command):
        subprocess.run(command, cwd=repository, check=True)
    run('node', 'scripts/build-i18n.mjs')
    run('node', 'scripts/build-chart-index.mjs')
    run(sys.executable, 'scripts/validate-generated-data.py')
    validate_derived_data(repository)
    root.mkdir(parents=True, exist_ok=True)
    for name in ['index.html', 'styles.css', '.nojekyll', 'LOCAL_TEST.md']:
        shutil.copy2(repository / name, root / name)
    for name in ['css', 'js', 'data/generated', 'assets/cards', 'assets/characters', 'assets/ui']:
        shutil.copytree(repository / name, root / name, dirs_exist_ok=True)
    # Source portraits include original large bootstrap images; normalization
    # bounds belong to the sync gate. Every deployed WebP must still be valid.
    from PIL import Image
    for directory in ['cards', 'characters']:
        for path in (root / 'assets' / directory).glob('*.webp'):
            with Image.open(path) as image:
                if image.format != 'WEBP':
                    raise ValueError(f'Invalid portrait format: {path}')
                image.verify()
    run(sys.executable, 'scripts/rewrite-pages-revisions.py', '--root', str(root), '--revision', revision)
    run('node', 'scripts/build-public-assets.mjs', '--root', str(root))
    run(sys.executable, 'scripts/build-localized-pages.py', '--root', str(root))
    for name in ['data/generated/music-search.json', 'ko/index.html', 'en/index.html',
                 'ja/index.html', 'sitemap.xml', 'robots.txt']:
        if not (root / name).is_file() or not (root / name).stat().st_size:
            raise ValueError(f'Missing public artifact output: {name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('_site'))
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    build(args.root, args.revision)
