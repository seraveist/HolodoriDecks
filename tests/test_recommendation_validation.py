"""Validation reuse must never hide a changed calculation input or failed CI run."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
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
def test_every_nonportrait_change_invalidates_proof(path):
    changed = {**BASE, path: ("100644", "a" * 40)}
    assert validation.fingerprint(tree(changed)) != validation.fingerprint(tree(BASE))
    del changed[path]
    if path in BASE:
        assert validation.fingerprint(tree(changed)) != validation.fingerprint(tree(BASE))


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
        zipped.writestr(validation.PROOF_FILE, json.dumps(proof))
    return buffer.getvalue()


@pytest.fixture
def evidence():
    current = {"schema": validation.SCHEMA, "suite": validation.SUITE,
               "fingerprint": validation.fingerprint(tree(BASE)), "tested_sha": "b" * 40,
               "repository": "owner/repo", "run_id": "200", "run_attempt": "1"}
    proof = {**current, "tested_sha": "a" * 40, "run_id": "100"}
    artifact = {"id": 10, "name": f"{validation.SUITE}-{current['fingerprint']}",
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
    {"tested_sha": ""},
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


def test_workflows_reuse_only_inventory_regression_and_publish_after_success():
    pages = workflow("pages.yml")
    assert pages["permissions"]["actions"] == "read"
    for filename, job in [("pages.yml", "deploy"), ("validate.yml", "validate")]:
        steps = workflow(filename)["jobs"][job]["steps"]
        capture_index = next(i for i, step in enumerate(steps) if step.get("id") == "recommendation_validation")
        test_index = next(i for i, step in enumerate(steps) if "node scripts/test-recommendation-inventories.mjs" in step.get("run", ""))
        build_index = next(i for i, step in enumerate(steps) if "node scripts/build-i18n.mjs" in step.get("run", ""))
        assert capture_index < test_index < build_index
        uploads = [i for i, step in enumerate(steps) if step.get("uses", "").startswith("actions/upload-artifact@")]
        assert uploads == [len(steps) - 1]
        assert steps[-1]["continue-on-error"] == "true"  # Optional proof cannot fail a deployment.
        assert "always()" not in steps[-1]["if"]  # Failed tests must never publish proof.
        if filename == "pages.yml":
            assert steps[test_index]["if"] == "steps.recommendation_validation.outputs.reuse != 'true'"
            assert steps[capture_index]["run"].endswith("--lookup")
            # All existing quick/asset/data/browser checks still run on every deploy.
            for step in steps:
                if step.get("if"):
                    assert step is steps[test_index] or step is steps[-1]
            assert any("python -m pytest -q" in step.get("run", "") for step in steps)
            assert any("node scripts/test-browser-smoke.mjs" in step.get("run", "") for step in steps)
        else:
            assert "if" not in steps[test_index]
            assert "--lookup" not in steps[capture_index]["run"]
