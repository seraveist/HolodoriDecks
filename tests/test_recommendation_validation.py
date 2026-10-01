"""Validation reuse must never hide a changed calculation input or failed CI run."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("recommendation_validation", ROOT / "scripts/recommendation-validation.py")
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


def tree(files):
    return b"\0".join(f"{mode} blob {oid}\t{path}".encode() for path, (mode, oid) in files.items()) + b"\0"


BASE = {
    "js/score.js": ("100644", "1" * 40),
    "data/generated/cards.json": ("100644", "2" * 40),
    "tests/fixtures/recommendation-inventories.json": ("100644", "3" * 40),
    ".github/workflows/validate.yml": ("100644", "4" * 40),
    "scripts/recommendation-validation.py": ("100644", "5" * 40),
    "assets/cards/card-1.webp": ("100644", "6" * 40),
    "assets/characters/chr-00001.webp": ("100644", "7" * 40),
    "assets/card-portrait-sync.json": ("100644", "8" * 40),
    "assets/character-portrait-sync.json": ("100644", "9" * 40),
}


@pytest.mark.parametrize("path", [path for path in BASE if not path.startswith("assets/")] + [
    "js/new-effect.js", "data/generated/master_refs.json", "data/generated/characters.json",
    "data/generated/boards.json", ".github/workflows/pages.yml", "package.json",
    "assets/ui/scoring.json", "assets/cards/new-code.js",
])
def test_calculation_policy_and_unknown_changes_invalidate_proof(path):
    changed = {**BASE, path: ("100644", "a" * 40)}
    assert validation.fingerprint(tree(changed)) != validation.fingerprint(tree(BASE))
    del changed[path]
    if path in BASE:
        assert validation.fingerprint(tree(changed)) != validation.fingerprint(tree(BASE))


@pytest.mark.parametrize("path", ["README.md", "index.html", "styles.css", "css/tweaks.css",
                                 "assets/cards/new-card.webp", "LOCAL_TEST.md"])
@pytest.mark.parametrize("suite", [validation.SUITE, validation.HISTORICAL_SUITE])
def test_presentation_only_changes_reuse_but_symlinks_and_executables_invalidate(path, suite):
    expected = validation.fingerprint(tree(BASE), suite)
    assert validation.fingerprint(tree({**BASE, path: ("100644", "a" * 40)}), suite) == expected
    for mode in ("100755", "120000"):
        assert validation.fingerprint(tree({**BASE, path: (mode, "a" * 40)}), suite) != expected


@pytest.mark.parametrize("path", ["js/score.js", "js/chart-score.js", "data/generated/cards.json",
                                 "data/generated/master_refs.json"])
def test_production_changes_rerun_inventory_but_not_isolated_history(path):
    changed = tree({**BASE, path: ("100644", "a" * 40)})
    assert validation.fingerprint(changed) != validation.fingerprint(tree(BASE))
    assert validation.fingerprint(changed, validation.HISTORICAL_SUITE) == validation.fingerprint(tree(BASE), validation.HISTORICAL_SUITE)


@pytest.mark.parametrize("path", ["analysis/unit-score/archive/score-v0.9.js",
    "analysis/unit-score/archive/runtime-v0.9-inputs.json.gz", "analysis/unit-score/reports/AT.md",
    "scripts/run-scoring-validation.mjs", "scripts/historical-scoring-workspace.mjs",
    "scripts/test-validation-at.mjs", "tests/test_recommendation_validation.py", "pyproject.toml",
    "package.json", ".github/workflows/validate.yml", "future-input.json"])
def test_historical_dependencies_and_unknown_files_invalidate_proof(path):
    changed = tree({**BASE, path: ("100644", "a" * 40)})
    assert validation.fingerprint(changed, validation.HISTORICAL_SUITE) != validation.fingerprint(tree(BASE), validation.HISTORICAL_SUITE)


def test_suite_and_actual_node_runtime_are_part_of_input_identity():
    content = tree(BASE)
    assert validation.fingerprint(content) != validation.fingerprint(content, validation.HISTORICAL_SUITE)
    assert validation.fingerprint(content, runtime={"node": "v24.1.0"}) != validation.fingerprint(content, runtime={"node": "v24.2.0"})


def test_image_batches_reuse_across_multiple_commits_but_symlinks_do_not():
    changed = {path: value for path, value in BASE.items() if not path.startswith("assets/")}
    changed.update({"assets/cards/new-card.webp": ("100644", "a" * 40),
                    "assets/characters/chr-00002.webp": ("100644", "b" * 40)})
    assert validation.fingerprint(tree(changed)) == validation.fingerprint(tree(BASE))
    changed["assets/cards/new-card.webp"] = ("120000", "a" * 40)
    assert validation.fingerprint(tree(changed)) != validation.fingerprint(tree(BASE))


def test_tree_order_is_irrelevant_but_renames_and_executable_modes_are_not():
    expected = validation.fingerprint(tree(BASE))
    assert validation.fingerprint(tree(dict(reversed(list(BASE.items()))))) == expected
    renamed = dict(BASE)
    renamed["js/different.js"] = renamed.pop("js/score.js")
    assert validation.fingerprint(tree(renamed)) != expected
    changed = {**BASE, "js/score.js": ("100755", "1" * 40)}
    assert validation.fingerprint(tree(changed)) != expected


def archive(proof):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zipped:
        zipped.writestr(validation.PROOF_FILES.get(proof.get("suite"), validation.PROOF_FILE), json.dumps(proof))
    return buffer.getvalue()


@pytest.fixture(params=[validation.SUITE, validation.HISTORICAL_SUITE])
def evidence(request):
    current = {"schema": validation.SCHEMA, "suite": request.param,
               "runtime": {"node": "v24.19.0", "system": "Linux", "machine": "x86_64"},
               "fingerprint": validation.fingerprint(tree(BASE), request.param), "tested_sha": "b" * 40,
               "repository": "owner/repo", "run_id": "200", "run_attempt": "1"}
    proof = {**current, "tested_sha": "a" * 40, "run_id": "100"}
    artifact = {"id": 10, "name": f"{request.param}-{current['fingerprint']}",
                "expired": False, "workflow_run": {"id": 100}}
    run = {"status": "completed", "conclusion": "success", "run_attempt": 1,
           "path": ".github/workflows/validate.yml", "repository": {"full_name": "owner/repo"},
           "head_repository": {"full_name": "owner/repo"}}
    return current, proof, artifact, run


def lookup(evidence, *, content=None):
    current, proof, artifact, run = evidence
    calls = []

    def api(path, *, raw=False):
        calls.append(path)
        if "?name=" in path:
            return {"artifacts": [artifact]}
        if path.endswith("/runs/100"):
            return run
        if path.endswith("/10/zip"):
            assert raw
            return archive(proof) if content is None else content
        raise AssertionError(path)

    return validation.find_proof(current, api=api), calls


@pytest.mark.parametrize("workflow", sorted(validation.WORKFLOWS))
def test_successful_same_inputs_reuse_despite_different_commit_after_squash(evidence, workflow):
    evidence[3]["path"] = workflow
    result, calls = lookup(evidence)
    if evidence[0]["suite"] == validation.HISTORICAL_SUITE and workflow == ".github/workflows/pages.yml":
        assert result["reuse"] is False
        assert len(calls) == 2
        return
    assert result["reuse"] is True
    assert result["source_run"] == 100
    assert result["tested_sha"] != evidence[0]["tested_sha"]
    assert len(calls) == 3


@pytest.mark.parametrize("patch", [
    {"conclusion": "failure"}, {"conclusion": "cancelled"}, {"conclusion": "skipped"},
    {"status": "in_progress"}, {"path": ".github/workflows/other.yml"},
    {"repository": {"full_name": "other/repo"}},
    {"head_repository": {"full_name": "fork/repo"}}, {"head_repository": {}},
])
def test_untrusted_or_unsuccessful_runs_cannot_skip_inventory_test(evidence, patch):
    evidence[3].update(patch)
    result, calls = lookup(evidence)
    assert result["reuse"] is False
    assert len(calls) == 2  # Do not even download the artifact.


@pytest.mark.parametrize("patch", [
    {"fingerprint": "changed"}, {"schema": 999}, {"suite": "other-suite"},
    {"repository": "other/repo"}, {"run_id": "99"}, {"run_attempt": "2"},
    {"tested_sha": ""}, {"runtime": {"node": "other-version"}},
])
def test_wrong_proof_and_stale_rerun_attempt_fall_back(evidence, patch):
    evidence[1].update(patch)
    assert lookup(evidence)[0]["reuse"] is False


@pytest.mark.parametrize("patch", [{"expired": True}, {"name": "wrong"}, {"workflow_run": {"id": 200}}])
def test_expired_foreign_or_current_run_artifacts_are_ignored(evidence, patch):
    evidence[2].update(patch)
    result, calls = lookup(evidence)
    assert result["reuse"] is False
    assert len(calls) == 1


@pytest.mark.parametrize("error", [OSError(), subprocess.TimeoutExpired("gh", 15),
                                  subprocess.CalledProcessError(1, "gh"), ValueError(), KeyError()])
def test_api_outage_or_missing_permission_runs_full_validation(evidence, error):
    def api(*args, **kwargs):
        raise error
    result = validation.find_proof(evidence[0], api=api)
    assert result == {"reuse": False, "reason": "proof-unavailable"}


def test_missing_or_corrupt_artifact_runs_full_validation(evidence):
    assert validation.find_proof(evidence[0], api=lambda path: {"artifacts": []})["reuse"] is False
    assert lookup(evidence, content=b"invalid zip")[0]["reuse"] is False
    assert lookup(evidence, content=b"x" * 65537)[0]["reuse"] is False


def test_network_lookup_has_one_total_time_budget(evidence, monkeypatch):
    clock = iter([0, 2, 21])
    monkeypatch.setattr(validation.time, "monotonic", lambda: next(clock))
    calls = []

    def api(path, **kwargs):
        calls.append(kwargs["timeout"])
        return {"artifacts": [evidence[2]]}

    monkeypatch.setattr(validation, "github_api", api)
    assert validation.find_proof(evidence[0])["reuse"] is False
    assert calls == [15]


def test_later_failed_run_does_not_hide_an_older_successful_proof(evidence):
    current, proof, artifact, run = evidence
    bad_artifact = {**artifact, "id": 11, "workflow_run": {"id": 101}}

    def api(path, *, raw=False):
        if "?name=" in path:
            return {"artifacts": [bad_artifact, artifact]}
        if path.endswith("/runs/101"):
            return {**run, "conclusion": "failure"}
        if path.endswith("/runs/100"):
            return run
        return archive(proof)

    assert validation.find_proof(current, api=api)["source_run"] == 100


def test_real_git_capture_and_dirty_checkout_guard(tmp_path):
    def git(*args):
        subprocess.run(["git", "-c", f"safe.directory={tmp_path.as_posix()}", *args],
                       cwd=tmp_path, check=True, capture_output=True)
    git("init")
    (tmp_path / "score.js").write_text("export const score = 1;\n")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture")
    captured = validation.capture(tmp_path, {})
    assert len(captured["tested_sha"]) == 40
    assert len(captured["fingerprint"]) == 64
    (tmp_path / "score.js").write_text("export const score = 2;\n")
    with pytest.raises(ValueError, match="clean checkout"):
        validation.capture(tmp_path, {})


def workflow(name):
    return yaml.load((ROOT / ".github/workflows" / name).read_text(encoding="utf-8"), Loader=yaml.BaseLoader)


def test_workflows_reuse_only_expensive_suites_and_publish_after_success():
    pages = workflow("pages.yml")
    assert "actions" not in pages["permissions"]  # Deployment no longer looks up test proofs.
    assert all('recommendation-validation.py' not in step.get('run', '') for step in pages['jobs']['deploy']['steps'])
    validate = workflow('validate.yml')
    assert validate['permissions']['actions'] == 'read'
    steps = validate['jobs']['app']['steps']
    capture_index = next(i for i, step in enumerate(steps) if step.get('id') == 'recommendation_validation')
    test_index = next(i for i, step in enumerate(steps) if 'node scripts/test-recommendation-inventories.mjs' in step.get('run', ''))
    quick_tests = next(i for i, step in enumerate(steps) if 'python -m pytest -q' in step.get('run', ''))
    assert capture_index < quick_tests < test_index
    assert steps[test_index]['if'] == "steps.recommendation_validation.outputs.reuse != 'true'"
    upload = steps[-1]
    assert upload['uses'].startswith('actions/upload-artifact@')
    assert upload['continue-on-error'] == 'true'
    assert "always()" not in upload['if'] and "reuse != 'true'" in upload['if']
    assert validate['jobs']['historical']['if'] == "needs.changes.outputs.historical == 'true'"
    assert validate['jobs']['historical']['steps'][-1]['run'].endswith('--historical-only')
    assert workflow("sync-master-data.yml")["jobs"]["validate_sync"]["permissions"]["actions"] == "read"


@pytest.mark.parametrize("suite", ["recommendation", "historical"])
def test_force_mode_captures_inputs_but_never_looks_up_proof(tmp_path, monkeypatch, suite, evidence):
    # Exercise the CLI: --force must still write fresh proof after full success.
    monkeypatch.setattr(sys, "argv", ["validation", "--root", str(tmp_path), "--suite", suite, "--lookup", "--force"])
    def capture(root, **kwargs):
        return {**evidence[0], "suite": kwargs["suite"]}
    def lookup(*args, **kwargs):
        pytest.fail("Forced validation must not query previous proof")
    monkeypatch.setattr(validation, "capture", capture)
    monkeypatch.setattr(validation, "find_proof", lookup)
    output = tmp_path / "output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    validation.main()
    assert "reuse=false\n" in output.read_text()
    expected_suite = validation.HISTORICAL_SUITE if suite == "historical" else validation.SUITE
    assert f"artifact_name={expected_suite}-" in output.read_text()
    assert (tmp_path / ".local" / validation.PROOF_FILES[expected_suite]).is_file()
