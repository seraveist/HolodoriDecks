#!/usr/bin/env python3
"""Select checks from committed changes; unknown paths and modes get full CI."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess

DOCS = {
    'README.md', 'LOCAL_TEST.md', 'PUBLIC_SITE.md', 'STATIC_PERFORMANCE.md',
    'DATA_SYNC.md', 'CARD_ASSET_SYNC.md', 'BOARD_UI.md', 'EXACT_CHART_CORPUS.md',
    'CHANGELOG.md', 'NOTICE.md', 'LICENSE', 'SCORING_VALIDATION.md',
    'SCORING_HANDOFF.md', 'HANDOFF_CURRENT.md', 'OBSERVATION_CATALOG_20260909.md',
}
PORTRAITS = re.compile(r'assets/(cards|characters)/[^/]+\.webp\Z')
PROVENANCE = {'assets/card-portrait-sync.json', 'assets/character-portrait-sync.json'}


def classify(entries: list[tuple[str, str]], *, full=False, manual=False) -> dict:
    app = full or manual
    public = app
    contracts = full
    historical = full
    assets = False
    for path, mode in entries:
        if mode != '100644':
            app = public = contracts = historical = True
            continue
        if path.startswith('analysis/') or path.startswith('scripts/') or path == 'verify-handoff.mjs':
            historical = True
        if (path.startswith('.github/') or path in {
            'scripts/ci-changes.py', 'scripts/check-ci-results.py',
            'scripts/ensure-pages-deployment.py', 'tests/test_ci_policy.py',
            'tests/test_sync_workflows.py', 'tests/test_pages_deployment.py', '.gitattributes',
        }):
            contracts = True
        if path.startswith('.github/'):
            historical = True  # Runner/runtime and CI policy are research inputs too.
        if path in DOCS:
            continue
        if PORTRAITS.fullmatch(path) or path in PROVENANCE:
            assets = public = True
            continue
        app = public = True
        # A new subsystem might affect workflow execution or research inputs.
        if not path.startswith(('js/', 'css/', 'src/', 'tests/', 'data/', '.github/', 'scripts/', 'analysis/')) and path not in {'index.html', 'styles.css', 'VERSION', 'pyproject.toml', '.nojekyll'}:
            contracts = historical = True
    return {'app': app, 'public': public, 'contracts': contracts, 'historical': historical,
            'profile': 'app' if app else 'assets' if assets else 'docs'}


def changed_entries(base: str, *, root=Path('.')) -> tuple[str, list[tuple[str, str]]]:
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True).stdout
    base_sha = git('rev-parse', '--verify', f'{base}^{{commit}}').decode().strip()
    raw = git('diff', '--raw', '-z', '--no-renames', base_sha, 'HEAD').split(b'\0')
    entries = []
    for index in range(0, len(raw) - 1, 2):
        metadata = raw[index].decode().split()
        old_mode, new_mode = metadata[0].lstrip(':'), metadata[1]
        mode = old_mode if new_mode == '000000' else new_mode
        entries.append((raw[index + 1].decode('utf-8'), mode))
    return base_sha, entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=os.environ.get('BASE_REF') or 'origin/main')
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--manual', action='store_true')
    args = parser.parse_args()
    base_sha, entries = changed_entries(args.base)
    full = args.full or os.environ.get('FULL_VALIDATION') == 'true'
    manual = args.manual or (os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
                            and not os.environ.get('CHECKOUT_REF'))
    plan = classify(entries, full=full, manual=manual)
    plan['base_sha'] = base_sha
    plan['head_sha'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if output := os.environ.get('GITHUB_OUTPUT'):
        with open(output, 'a', encoding='utf-8') as stream:
            for key, value in plan.items():
                stream.write(f'{key}={str(value).lower() if isinstance(value, bool) else value}\n')
            stream.write(f'plan={json.dumps(plan, separators=(",", ":"))}\n')
    print(json.dumps({'plan': plan, 'changed_files': [path for path, _ in entries]}, indent=2))


if __name__ == '__main__':
    main()
