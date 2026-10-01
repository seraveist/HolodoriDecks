"""Change selection and the required CI gate must fail closed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tomllib

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


changes = load('ci-changes')
gate = load('check-ci-results')


@pytest.mark.parametrize('paths,expected', [
    (['README.md', 'LOCAL_TEST.md'], (False, False, False, False, 'docs')),
    (['assets/cards/new.webp'], (False, True, False, False, 'assets')),
    (['assets/characters/chr-1.webp', 'README.md'], (False, True, False, False, 'assets')),
    (['assets/card-portrait-sync.json'], (False, True, False, False, 'assets')),
    (['js/score.js'], (True, True, False, False, 'app')),
    (['css/tweaks.css'], (True, True, False, False, 'app')),
    (['data/generated/cards.json', 'data/sync_state.json'], (True, True, False, False, 'app')),
    (['src/holodori_decksim/sync.py'], (True, True, False, False, 'app')),
    (['.github/workflows/validate.yml'], (True, True, True, True, 'app')),
    (['scripts/ensure-pages-deployment.py'], (True, True, True, True, 'app')),
    (['analysis/unit-score/observations/AZ.json'], (True, True, False, True, 'app')),
    (['scripts/test-validation-az.mjs'], (True, True, False, True, 'app')),
    (['unknown-directory/runtime'], (True, True, True, True, 'app')),
    (['new-doc.md'], (True, True, True, True, 'app')),
])
def test_checks_follow_committed_input_scope(paths, expected):
    plan = changes.classify([(path, '100644') for path in paths])
    assert tuple(plan[key] for key in ['app', 'public', 'contracts', 'historical', 'profile']) == expected


@pytest.mark.parametrize('mode', ['120000', '100755', '160000'])
def test_presentation_names_cannot_hide_symlinks_executables_or_submodules(mode):
    plan = changes.classify([('README.md', mode)])
    assert all(plan[key] for key in ['app', 'public', 'contracts', 'historical'])


def test_full_validation_runs_every_check_even_for_docs():
    plan = changes.classify([('README.md', '100644')], full=True)
    assert all(plan[key] for key in ['app', 'public', 'contracts', 'historical'])


def test_manual_validation_runs_service_checks_with_no_diff():
    plan = changes.classify([], manual=True)
    assert plan['app'] and plan['public']


def results(plan):
    rows = {'changes': {'result': 'success'}, 'metadata': {'result': 'skipped' if plan['app'] else 'success'}}
    for job, flag in [('app', 'app'), ('public', 'public'), ('workflow_contracts', 'contracts'), ('historical', 'historical')]:
        rows[job] = {'result': 'success' if plan[flag] else 'skipped'}
    return rows


@pytest.mark.parametrize('paths', [['README.md'], ['assets/cards/new.webp'], ['js/score.js'], ['.github/workflows/validate.yml']])
def test_only_planned_skips_satisfy_required_gate(paths):
    plan = changes.classify([(path, '100644') for path in paths])
    gate.require_success(results(plan), plan)


@pytest.mark.parametrize('job', ['changes', 'app', 'public', 'workflow_contracts', 'historical'])
@pytest.mark.parametrize('result', ['failure', 'cancelled', 'skipped', None])
def test_required_gate_rejects_failed_or_missing_required_jobs(job, result):
    plan = changes.classify([], full=True)
    rows = results(plan)
    rows[job]['result'] = result
    with pytest.raises(ValueError):
        gate.require_success(rows, plan)


@pytest.mark.parametrize('result', ['failure', 'cancelled', None])
def test_unselected_job_cannot_hide_a_failure(result):
    plan = changes.classify([('README.md', '100644')])
    rows = results(plan)
    rows['public']['result'] = result
    with pytest.raises(ValueError):
        gate.require_success(rows, plan)


def test_missing_plan_does_not_approve_skipped_checks():
    with pytest.raises(ValueError):
        gate.require_success({'changes': {'result': 'success'}}, {})


@pytest.mark.parametrize('result', ['failure', 'cancelled', 'skipped', None])
def test_docs_and_assets_still_require_metadata(result):
    plan = changes.classify([('README.md', '100644')])
    rows = results(plan)
    rows['metadata']['result'] = result
    with pytest.raises(ValueError):
        gate.require_success(rows, plan)


def test_git_changes_include_both_sides_of_renames_and_preserve_file_modes(tmp_path):
    def git(*args):
        return subprocess.check_output(['git', '-c', 'user.name=CI Test', '-c', 'user.email=ci@example.invalid', *args], cwd=tmp_path, stderr=subprocess.DEVNULL)
    git('init')
    (tmp_path / 'README.md').write_text('original')
    git('add', '.')
    git('commit', '-m', 'base')
    base = git('rev-parse', 'HEAD').decode().strip()
    (tmp_path / 'README.md').rename(tmp_path / 'new name.md')
    (tmp_path / 'README.md').symlink_to('new name.md')
    git('add', '.')
    git('commit', '-m', 'rename and symlink')
    resolved, entries = changes.changed_entries(base, root=tmp_path)
    assert resolved == base
    assert ('README.md', '120000') in entries
    assert ('new name.md', '100644') in entries
    assert all(changes.classify(entries)[key] for key in ['app', 'public', 'contracts', 'historical'])


def test_gate_command_propagates_public_artifact_failure():
    plan = changes.classify([], full=True)
    rows = results(plan)
    rows['public']['result'] = 'failure'
    completed = subprocess.run([sys.executable, ROOT / 'scripts/check-ci-results.py'],
        env={**os.environ, 'CI_NEEDS': json.dumps(rows), 'CI_PLAN': json.dumps(plan)}, capture_output=True)
    assert completed.returncode != 0


def test_core_sync_dependency_boundary_and_public_build_extras():
    project = tomllib.loads((ROOT / 'pyproject.toml').read_text())['project']
    assert not any(value.lower().startswith('hunmin') for value in project['dependencies'])
    extras = project['optional-dependencies']
    assert any(value.lower().startswith('hunmin') for value in extras['music-search'])
    assert any(value.lower().startswith('tinycss2') for value in extras['public-build'])
    assert any(value.lower().startswith('pillow') for value in extras['public-build'])
