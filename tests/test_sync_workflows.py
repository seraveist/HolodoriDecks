"""Exercise sync commands and publication conditions in the actual workflows."""
import os
import json
from pathlib import Path
import re
import shutil
import subprocess

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]


def workflow(name):
    return yaml.load((ROOT / ".github/workflows" / name).read_text(encoding="utf-8"), Loader=yaml.BaseLoader)


def condition(expression, values):
    # These workflows use only boolean operators, comparisons and status checks.
    expression = re.sub(r"\b(?:needs|steps|inputs|github)\.[\w.]+", lambda match: repr(values.get(match[0], "")), expression)
    expression = expression.replace("always()", "True").replace("cancelled()", "False")
    expression = expression.replace("&&", " and ").replace("||", " or ")
    expression = re.sub(r"!(?!=)", " not ", expression)
    expression = re.sub(r"\btrue\b", "True", expression)
    expression = re.sub(r"\bfalse\b", "False", expression)
    return bool(eval(expression.strip(), {"__builtins__": {}}, {}))


def test_master_validation_is_called_directly_on_generated_commit():
    jobs = workflow("sync-master-data.yml")["jobs"]
    validate = jobs["validate_sync"]
    assert validate["uses"] == "./.github/workflows/validate.yml"
    assert validate["with"]["checkout_ref"] == "${{ needs.sync.outputs.head_sha }}"
    assert "validate_sync" in jobs["merge"]["needs"]
    checkout = workflow("validate.yml")["jobs"]["validate"]["steps"][0]
    assert checkout["with"]["ref"] == "${{ inputs.checkout_ref || github.sha }}"
    assert "--event pull_request" not in str(jobs)


def test_sync_uses_only_standard_hosted_runners_and_propagates_failure():
    jobs = workflow("sync-master-data.yml")["jobs"]
    assert jobs["sync"]["runs-on"] == "macos-15"
    assert jobs["merge"]["runs-on"] == "ubuntu-latest"
    assert jobs["deploy"]["runs-on"] == "ubuntu-latest"
    assert workflow("validate.yml")["jobs"]["validate"]["runs-on"] == "ubuntu-latest"
    assert "HOLODORI_MASTER_SYNC_RUNNER" not in str(jobs)
    sync = next(step for step in jobs["sync"]["steps"] if step.get("id") == "sync")
    assert sync["run"].index("set -euo pipefail") < sync["run"].index("holodori-sync")


def test_master_sync_avoids_empty_array_expansion_on_macos_bash():
    steps = workflow("sync-master-data.yml")["jobs"]["sync"]["steps"]
    script = next(step["run"] for step in steps if step.get("id") == "sync")
    # Ubuntu's newer Bash accepts empty arrays under nounset; macOS Bash 3.2
    # does not. Keep the regression detectable on the Ubuntu validation runner.
    assert not re.search(r"\$\{[^}]*\[@\]", script)


@pytest.mark.parametrize("force,expected_args", [("false", ["0"]), ("true", ["1", "--force"])])
@pytest.mark.parametrize("changed,exit_code", [("false", 0), ("true", 0), ("true", 23)])
def test_master_sync_command_arguments_outputs_and_failure(tmp_path, force, expected_args, changed, exit_code):
    steps = workflow("sync-master-data.yml")["jobs"]["sync"]["steps"]
    script = next(step["run"] for step in steps if step.get("id") == "sync")
    # Missing schedule inputs resolve to false, as does an explicit non-force dispatch.
    force_expression = "${{ inputs.force || false }}"
    assert force_expression in script
    script = script.replace(force_expression, force).replace("/tmp/sync-result.json", "sync-result.json")
    args_file = tmp_path / "sync-args.txt"
    output_file = tmp_path / "github-output.txt"
    output_file.touch()
    stub = tmp_path / "holodori-sync"
    stub.write_text(
        '#!/bin/bash\n'
        'printf \'%s\\n\' "$#" "$@" > "$SYNC_ARGS"\n'
        f'printf \'%s\\n\' \'{{"changed": {changed}, "master_version": "test-version", "upstream_commit": "test-commit"}}\'\n'
        'exit "$SYNC_EXIT_CODE"\n',
        encoding="utf-8",
    )
    stub.chmod(0o755)
    result = subprocess.run(
        ["/bin/bash", "--noprofile", "--norc", "-e", "-c", script],
        cwd=tmp_path,
        env={**os.environ, "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}",
             "GITHUB_OUTPUT": str(output_file), "SYNC_ARGS": str(args_file), "SYNC_EXIT_CODE": str(exit_code)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == exit_code, result.stderr
    assert args_file.read_text(encoding="utf-8").splitlines() == expected_args
    if exit_code:
        # The stub emits valid JSON even on failure: tee must not hide its exit
        # status, and the subsequent Python output publication must not run.
        assert output_file.read_text(encoding="utf-8") == ""
    else:
        assert output_file.read_text(encoding="utf-8").splitlines() == [
            f"changed={changed}", "master_version=test-version", "upstream_commit=test-commit",
        ]


def test_master_schedule_runs_daily_at_midnight_fifteen_korean_time():
    assert workflow("sync-master-data.yml")["on"]["schedule"] == [{"cron": "15 15 * * *"}]


def test_master_pr_branch_is_not_updated_until_full_validation_passes():
    jobs = workflow("sync-master-data.yml")["jobs"]
    sync = jobs["sync"]["steps"]
    candidate = next(step for step in sync if step.get("id") == "sync_commit")
    assert candidate["env"]["SYNC_BRANCH"] == "automation/master-data-candidate"
    assert not any("gh pr " in step.get("run", "") for step in sync)
    assert "automation/master-data-sync" not in str(sync)
    publish = jobs["merge"]
    assert set(publish["needs"]) == {"sync", "validate_sync"}
    assert "if" not in publish  # default success() blocks publication after failed/skipped validation
    assert publish["steps"][0]["with"]["ref"] == "${{ needs.sync.outputs.head_sha }}"
    push = next(step for step in publish["steps"] if "git push" in step.get("run", ""))
    assert 'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"' in push["run"]
    assert "HEAD:refs/heads/automation/master-data-sync" in push["run"]
    merge = next(step for step in publish["steps"] if step.get("id") == "auto_merge")
    assert '--match-head-commit "$EXPECTED_HEAD"' in merge["run"]
    assert merge["run"].index('= "MERGED"') < merge["run"].index('echo "merged=true"')


@pytest.mark.parametrize("safe,event,auto_merge,can_merge", [
    ("true", "schedule", False, True),
    ("false", "schedule", False, False),
    ("true", "workflow_dispatch", True, True),
    ("true", "workflow_dispatch", False, False),
    ("false", "workflow_dispatch", True, False),
])
def test_review_only_updates_still_require_full_validation(safe, event, auto_merge, can_merge):
    jobs = workflow("sync-master-data.yml")["jobs"]
    values = {"needs.sync.outputs.has_diff": "true", "inputs.dry_run": False,
              "needs.sync.outputs.safe": safe, "github.event_name": event, "inputs.auto_merge": auto_merge}
    assert condition(jobs["validate_sync"]["if"], values)
    merge = next(step for step in jobs["merge"]["steps"] if step.get("id") == "auto_merge")
    assert condition(merge["if"], values) is can_merge
    assert not condition(jobs["validate_sync"]["if"], {**values, "inputs.dry_run": True})
    assert not condition(jobs["validate_sync"]["if"], {**values, "needs.sync.outputs.has_diff": "false"})


@pytest.mark.parametrize("diff,merge_result,merged,sync_result,dry_run,expected", [
    ("true", "success", "true", "success", False, True),
    ("false", "skipped", "", "success", False, True),
    ("true", "failure", "", "success", False, False),
    ("true", "failure", "true", "success", False, False),
    ("true", "skipped", "", "success", False, False),
    ("true", "success", "", "success", False, False),  # review PR, not merged
    ("false", "skipped", "", "failure", False, False),
    ("true", "success", "true", "success", True, False),
])
def test_data_deployment_does_not_depend_on_portrait_result(diff, merge_result, merged, sync_result, dry_run, expected):
    job = workflow("sync-master-data.yml")["jobs"]["deploy"]
    assert set(job["needs"]) == {"sync", "merge"}
    assert "sync-card-assets" not in str(job)
    assert condition(job["if"], {"github.event_name": "schedule", "inputs.dry_run": dry_run,
        "needs.sync.result": sync_result, "needs.merge.result": merge_result,
        "needs.merge.outputs.merged": merged,
        "needs.sync.outputs.has_diff": diff}) is expected


@pytest.mark.parametrize("pending,errors", [(0, 0), (1, 0), (0, 1), (1, 1)])
def test_partial_images_can_be_committed_and_merged_before_reporting_errors(pending, errors):
    steps = workflow("sync-card-assets.yml")["jobs"]["sync"]["steps"]
    by_id = {step["id"]: step for step in steps if "id" in step}
    values = {"github.event_name": "schedule", "inputs.dry_run": False,
        "steps.diff.outputs.has_diff": "true", "steps.gate.outputs.safe": "true",
        "steps.sync_assets.outputs.pending_count": str(pending),
        "steps.sync_assets.outputs.error_count": str(errors), "steps.asset_pr.outputs.number": "42"}
    for step in (by_id["asset_commit"], by_id["asset_pr"], by_id["auto_merge"]):
        assert condition(step["if"], values)
    failure = next(index for index, step in enumerate(steps) if step.get("name") == "Report source failures after publishing verified portraits")
    assert failure > steps.index(by_id["auto_merge"])
    assert failure > steps.index(by_id["pages"])
    assert "git diff --cached --name-status" in by_id["diff"]["run"]


def test_portrait_schedule_runs_twice_daily_in_korean_time():
    assert workflow("sync-card-assets.yml")["on"]["schedule"] == [{"cron": "0 2,14 * * *"}]


@pytest.mark.parametrize("name,job", [("sync-master-data.yml", "merge"), ("sync-card-assets.yml", "sync")])
def test_generated_commit_status_requires_successful_validation_and_exact_head(name, job):
    definition = workflow(name)
    assert definition["permissions"]["statuses"] == "write"
    merge = next(step for step in definition["jobs"][job]["steps"] if step.get("id") == "auto_merge")
    script = merge["run"]
    assert script.index('= "$EXPECTED_HEAD"') < script.index('statuses/$EXPECTED_HEAD') < script.index('gh pr merge')
    assert '-f context=validate' in script
    assert '-f state=success' in script
    assert "safe == 'true'" in merge["if"]


@pytest.mark.parametrize("step_name", [
    "Validate transport, cache and CSS regressions",
    "Build optimized Pages artifact",
    "Test optimized public application and actual browser cache",
])
def test_public_static_pipelines_stop_after_failed_node_command(tmp_path, step_name):
    definition = workflow("static-performance.yml")
    job = definition["jobs"]["public-static"]
    step = next(step for step in job["steps"] if step.get("name") == step_name)
    workflow_shell = definition.get("defaults", {}).get("run", {}).get("shell")
    job_shell = job.get("defaults", {}).get("run", {}).get("shell", workflow_shell)
    shell = step.get("shell", job_shell)
    # Match Actions: implicit Bash uses -e, while explicit Bash adds pipefail.
    command = ["/bin/bash", "--noprofile", "--norc", "-e"]
    if shell == "bash":
        command += ["-o", "pipefail"]
    else:
        assert shell is None
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (tmp_path / ".local").mkdir()
    calls = tmp_path / "node-calls.txt"
    for name, script in {
        "node": 'echo called >> "$NODE_CALLS"\necho simulated-node-failure >&2\nexit 23\n',
        "python": "exit 0\n",
        "cp": "exit 0\n",
    }.items():
        stub = bin_dir / name
        stub.write_text("#!/bin/bash\n" + script, encoding="utf-8")
        stub.chmod(0o755)
    result = subprocess.run(
        command + ["-c", step["run"]], cwd=tmp_path,
        env={**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
             "NODE_CALLS": str(calls)},
        capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 23, result.stderr
    assert calls.read_text(encoding="utf-8").splitlines() == ["called"]


@pytest.mark.parametrize("result,exit_code", [("success", 0), ("failure", 1), ("cancelled", 1), ("skipped", 1)])
def test_required_validation_fails_when_macos_workflow_checks_do_not_pass(tmp_path, result, exit_code):
    jobs = workflow("validate.yml")["jobs"]
    contracts = jobs["workflow_contracts"]
    assert contracts["runs-on"] == "macos-15"
    assert contracts["steps"][0]["with"]["ref"] == "${{ inputs.checkout_ref || github.sha }}"
    assert any("python -m pytest -q tests/test_sync_workflows.py" in step.get("run", "") for step in contracts["steps"])
    validate = jobs["validate"]
    assert validate["needs"] == "workflow_contracts"
    # A skipped dependent job can satisfy a required check; run an explicit
    # failing gate instead, even when the macOS prerequisite failed/skipped.
    assert validate["if"] == "always() && !cancelled()"
    gate = next(step for step in validate["steps"] if step.get("name") == "Require workflow contract checks")
    assert gate["env"]["WORKFLOW_CHECK_RESULT"] == "${{ needs.workflow_contracts.result }}"
    completed = subprocess.run(
        ["/bin/bash", "-e", "-c", gate["run"]], cwd=tmp_path,
        env={**os.environ, "WORKFLOW_CHECK_RESULT": result},
        capture_output=True, text=True, timeout=10,
    )
    assert completed.returncode == exit_code, completed.stderr


@pytest.mark.parametrize("name", ["validate.yml", "static-performance.yml"])
def test_pr_validation_does_not_duplicate_push_runs_or_cancel_sync(name):
    definition = workflow(name)
    assert "push" not in definition["on"]
    assert definition["on"]["pull_request"]["branches"] == ["main"]
    assert "workflow_dispatch" in definition["on"]
    group = definition["concurrency"]["group"]
    assert "github.event_name" in group
    assert "github.event.pull_request.number || github.run_id" in group
    cancellation = definition["concurrency"]["cancel-in-progress"].removeprefix("${{").removesuffix("}}")
    for event in ["pull_request", "schedule", "workflow_dispatch"]:
        assert condition(cancellation, {"github.event_name": event}) is (event == "pull_request")
    if name == "validate.yml":
        assert "workflow_call" in definition["on"]
        for trigger in ["workflow_dispatch", "workflow_call"]:
            assert definition["on"][trigger]["inputs"]["full_validation"]["type"] == "boolean"


def test_source_and_built_browser_coverage_are_both_retained_without_duplicate_source_run():
    validate = workflow("validate.yml")["jobs"]["validate"]["steps"]
    public = workflow("static-performance.yml")["jobs"]["public-static"]["steps"]
    source_commands = "\n".join(step.get("run", "") for step in validate)
    public_commands = "\n".join(step.get("run", "") for step in public)
    assert source_commands.count("node scripts/test-browser-smoke.mjs") == 1
    assert source_commands.count("node scripts/test-board-browser.mjs") == 1
    assert "node scripts/test-browser-smoke.mjs" not in public_commands
    assert 'BROWSER_SMOKE_ROOT="$PWD/_site"' in public_commands
    assert "node scripts/test-browser-smoke-core.mjs" in public_commands
    assert "node scripts/test-board-browser.mjs" in public_commands


@pytest.mark.parametrize("reuse,should_run", [("true", False), ("false", True), ("", True)])
def test_only_expensive_suites_can_be_skipped_with_explicit_matching_proof(reuse, should_run):
    steps = workflow("validate.yml")["jobs"]["validate"]["steps"]
    for step_name, proof_id in [("Validate recommendation inventories", "recommendation_validation"),
                                ("Reproduce portable scoring handoff", "historical_validation")]:
        step = next(step for step in steps if step.get("name") == step_name)
        assert condition(step["if"], {f"steps.{proof_id}.outputs.reuse": reuse}) is should_run
        assert "continue-on-error" not in step
    # The production regression group and source browser checks always run.
    scoring = next(step for step in steps if step.get("name") == "Validate scoring and search regressions")
    assert "if" not in scoring and "continue-on-error" not in scoring
    assert "node scripts/run-core-regressions.mjs" in scoring["run"]


@pytest.mark.parametrize("fail_index", [None, 0, 9, 19])
def test_shared_production_regressions_preserve_process_isolation_and_stop_on_failure(tmp_path, fail_index):
    script = (ROOT / "scripts/run-core-regressions.mjs").read_text()
    tests = re.findall(r'"(scripts/test-[\w-]+\.mjs)"', script)
    assert len(tests) == 20
    for filename, job in [("sync-master-data.yml", "sync"), ("validate.yml", "validate"), ("pages.yml", "deploy")]:
        commands = "\n".join(step.get("run", "") for step in workflow(filename)["jobs"][job]["steps"])
        assert commands.count("node scripts/run-core-regressions.mjs") == 1
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts/run-core-regressions.mjs").write_text(script)
    for index, name in enumerate(tests):
        (tmp_path / name).write_text(
            'import { appendFileSync } from "node:fs";\n'
            f'appendFileSync("calls.txt", {json.dumps(name + chr(10))});\n'
            f'process.exit({23 if index == fail_index else 0});\n'
        )
    completed = subprocess.run([shutil.which("node"), "scripts/run-core-regressions.mjs"],
                               cwd=tmp_path, capture_output=True, text=True, timeout=15)
    assert completed.returncode == (0 if fail_index is None else 23), completed.stderr
    assert (tmp_path / "calls.txt").read_text().splitlines() == tests[:None if fail_index is None else fail_index + 1]
