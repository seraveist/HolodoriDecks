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
    master = read('manifest.json')
    locales = read('i18n/manifest.json')
    commit, version = master['source_commit'], master['master_version']
    if (not locales.get('required_entry_count')
        or type(locales.get('card_name_alias_count')) is not int
        or locales['card_name_alias_count'] < 0
        or locales.get('master_version') != version
        or set(locales.get('locales', {})) != {'ko', 'en', 'ja'}
        or any(row.get('commit') != commit or row.get('source_version') != version
               for row in locales['locales'].values())):
        raise ValueError('Invalid or stale locale manifest')
    chart, runtime = read('chart-index.json'), read('exact-runtime-index.json')
    assets, rules = read('chart-assets.json'), read('live-score-rules.json')
    if (any(doc.get('source_commit') != commit for doc in (chart, assets, rules))
        or assets.get('master_version') != version
        or len(assets['charts']) != chart.get('chart_count')):
        raise ValueError('Mixed chart and Master snapshots')
    if (runtime.get('runtimeExactCount') != len(runtime.get('charts', {}))
        or runtime.get('currentMasterSourceCommit') != chart.get('source_commit')
        or runtime.get('currentMasterChartCount') != chart.get('chart_count')
        or not re.fullmatch(r'[0-9a-f]{64}', str(runtime.get('source', {}).get('sha256', '')))
        or any(not re.fullmatch(r'[0-9a-f]{64}', str(row.get('objectSha256', '')))
               for row in runtime['charts'].values())):
        raise ValueError('Invalid or stale Runtime Exact index')


def verify_derived_data(repository: Path) -> None:
    generated = repository / 'data/generated'
    locale_manifest = generated / 'i18n/manifest.json'

    def snapshot():
        paths = [generated / name for name in ('chart-index.json', 'live-score-rules.json')]
        paths.extend((generated / 'i18n').rglob('*.json'))
        return {file: file.read_bytes() for file in paths}

    before = snapshot()
    for script in ('build-i18n.mjs', 'build-chart-index.mjs'):
        subprocess.run(['node', f'scripts/{script}'], cwd=repository, check=True)
    after = snapshot()
    previous, regenerated = (json.loads(data[locale_manifest]) for data in (before, after))
    previous.pop('generated_at', None)
    regenerated.pop('generated_at', None)
    if previous == regenerated:
        after[locale_manifest] = before[locale_manifest]
        locale_manifest.write_bytes(before[locale_manifest])
    changed = sorted(str(path.relative_to(repository)) for path in before.keys() | after.keys()
                     if before.get(path) != after.get(path))
    if changed:
        raise ValueError(f'Commit regenerated deployment data: {", ".join(changed)}')


def build(root: Path, revision: str, *, repository=REPOSITORY, verify_derived=False) -> None:
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
    if verify_derived:
        verify_derived_data(repository)
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
    parser.add_argument('--verify-derived', action='store_true', help='Regenerate from the pinned upstream and verify committed output (CI)')
    args = parser.parse_args()
    build(args.root, args.revision, verify_derived=args.verify_derived)
