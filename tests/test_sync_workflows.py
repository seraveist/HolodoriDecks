"""Exercise sync commands and publication conditions in the actual workflows."""
import os
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

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


def test_portrait_collection_uses_the_verified_octo_hosted_runner():
    # Ubuntu can pass the public snapshot sync while its Octo fallback returns
    # 403. Keep both game-asset collectors on the verified hosted environment.
    master_jobs = workflow("sync-master-data.yml")["jobs"]
    portrait_job = workflow("sync-card-assets.yml")["jobs"]["sync"]
    assert portrait_job["runs-on"] == master_jobs["sync"]["runs-on"] == "macos-15"
    assert master_jobs["merge"]["runs-on"] == "ubuntu-latest"
    steps = {step["id"]: step for step in portrait_job["steps"] if "id" in step}
    assert "--catalog-cache /tmp/holodori-octo-list.json" in steps["sync_assets"]["run"]
    assert "--catalog-cache /tmp/holodori-octo-list.json" in steps["sync_characters"]["run"]


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
    definition = workflow("validate.yml")
    job = definition["jobs"]["public"]
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
        "python": 'echo called >> "$NODE_CALLS"\nexit 23\n',
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
    assert set(validate["needs"]) == {"changes", "metadata", "workflow_contracts", "app", "public", "historical"}
    # A skipped dependent job can satisfy a required check; run an explicit
    # failing gate instead, even when the macOS prerequisite failed/skipped.
    assert validate["if"] == "always() && !cancelled()"
    gate = next(step for step in validate["steps"] if step.get("name") == "Require all selected checks")
    assert gate["env"]["CI_NEEDS"] == "${{ toJSON(needs) }}"
    plan = {"app": True, "public": True, "contracts": True, "historical": True}
    needs = {job: {"result": "success"} for job in validate["needs"]}
    needs["workflow_contracts"]["result"] = result
    completed = subprocess.run(
        ["/bin/bash", "-e", "-c", gate["run"]], cwd=ROOT,
        env={**os.environ, "CI_PLAN": json.dumps(plan), "CI_NEEDS": json.dumps(needs)},
        capture_output=True, text=True, timeout=10,
    )
    assert completed.returncode == exit_code, completed.stderr


@pytest.mark.parametrize("name", ["validate.yml"])
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
    jobs = workflow("validate.yml")["jobs"]
    validate = jobs["app"]["steps"]
    public = jobs["public"]["steps"]
    app_commands = "\n".join(step.get("run", "") for step in validate)
    assert "node scripts/run-app-validation.mjs" in app_commands
    source_commands = (ROOT / "scripts/run-app-validation.mjs").read_text()
    public_commands = "\n".join(step.get("run", "") for step in public)
    assert source_commands.count('"test-browser-smoke"') == 1
    assert source_commands.count('"test-board-browser"') == 1
    assert '"test-optimizer-client"' not in source_commands  # wrapper owns this test
    assert "node scripts/test-browser-smoke.mjs" not in public_commands
    assert 'BROWSER_SMOKE_ROOT="$PWD/_site"' in public_commands
    assert "node scripts/test-browser-smoke-core.mjs" in public_commands
    assert "node scripts/test-board-browser.mjs" in public_commands


def test_pages_uses_same_build_and_only_runs_production_smoke_after_deployment():
    pages = workflow('pages.yml')['jobs']
    assert pages['smoke']['needs'] == 'deploy'
    assert pages['smoke']['steps'][0]['uses'].startswith('actions/checkout@')
    assert any(step.get('env', {}).get('DEPLOYMENT_SHA') == '${{ github.sha }}' for step in pages['smoke']['steps'])
    ci = workflow('validate.yml')['jobs']['public']['steps']
    for steps in [ci, pages['deploy']['steps']]:
        assert sum('scripts/build-pages-artifact.py' in step.get('run', '') for step in steps) == 1
    deployment_commands = '\n'.join(step.get('run', '') for step in pages['deploy']['steps'])
    assert 'pytest' not in deployment_commands and 'run-core-regressions' not in deployment_commands
    assert not (ROOT / '.github/workflows/static-performance.yml').exists()
    assert not (ROOT / '.github/workflows/production-smoke.yml').exists()


def test_asset_fallback_install_covers_cards_and_member_icons():
    steps = workflow('sync-card-assets.yml')['jobs']['sync']['steps']
    install = next(step for step in steps if step.get('name') == 'Install pinned asset tooling when fallback may be needed')
    for cards, characters, expected in [('0', '0', False), ('1', '0', True), ('0', '1', True)]:
        assert condition(install['if'], {'steps.audit.outputs.missing_count': cards,
            'steps.character_audit.outputs.missing_count': characters}) is expected
    helpers = next(step for step in steps if step.get('name') == 'Validate card asset sync helpers')
    assert not condition(helpers['if'], {'github.event_name': 'schedule'})
    assert condition(helpers['if'], {'github.event_name': 'push'})


def test_network_diagnostics_aggregate_access_failures_instead_of_failing_each_environment():
    jobs = workflow('check-sync-network.yml')['jobs']
    # Inline diagnostics have no checkout or project dependency file to hash.
    setup = next(step for step in jobs['catalogue']['steps'] if 'setup-python@' in step.get('uses', ''))
    assert 'cache' not in setup['with']
    probe = next(step['run'] for step in jobs['catalogue']['steps'] if step.get('shell') == 'python')
    assert "raise SystemExit" not in probe
    assert jobs['summary']['needs'] == 'catalogue'
    assert any('asset_verified' in step.get('run', '') and 'raise SystemExit' in step.get('run', '') for step in jobs['summary']['steps'])


@pytest.mark.parametrize('verified,expected_status', [(False, 1), (True, 0)])
def test_network_summary_requires_an_actual_verified_download(tmp_path, verified, expected_status):
    summary = workflow('check-sync-network.yml')['jobs']['summary']
    script = next(step['run'] for step in summary['steps'] if step.get('shell') == 'python')
    for runner in ['ubuntu-latest', 'macos-15']:
        directory = tmp_path / 'reports' / f'catalogue-{runner}'
        directory.mkdir(parents=True)
        row = {'runner': runner, 'ok': runner == 'macos-15',
               'asset_verified': verified and runner == 'macos-15'}
        (directory / 'catalogue.json').write_text(json.dumps([row]))
    completed = subprocess.run([sys.executable, '-c', script], cwd=tmp_path,
        env={**os.environ, 'GITHUB_STEP_SUMMARY': str(tmp_path / 'summary.md')}, capture_output=True)
    assert completed.returncode == expected_status


@pytest.mark.parametrize('result,expected_status', [('success', 0), ('failure', 1), ('cancelled', 1), ('skipped', 1)])
def test_network_summary_does_not_hide_a_probe_execution_failure(tmp_path, result, expected_status):
    summary = workflow('check-sync-network.yml')['jobs']['summary']
    script = next(step['run'] for step in summary['steps'] if step.get('name') == 'Require complete network probes')
    completed = subprocess.run(['/bin/bash', '-e', '-c', script], cwd=tmp_path,
        env={**os.environ, 'PROBE_RESULT': result}, capture_output=True)
    assert completed.returncode == expected_status


@pytest.mark.parametrize("reuse,should_run", [("true", False), ("false", True), ("", True)])
def test_only_expensive_suites_can_be_skipped_with_explicit_matching_proof(reuse, should_run):
    steps = workflow("validate.yml")["jobs"]["app"]["steps"]
    for step_name, proof_id in [("Validate recommendation inventories", "recommendation_validation")]:
        step = next(step for step in steps if step.get("name") == step_name)
        assert condition(step["if"], {f"steps.{proof_id}.outputs.reuse": reuse}) is should_run
        assert "continue-on-error" not in step
    # The production regression group and source browser checks always run.
    scoring = next(step for step in steps if step.get("name") == "Validate scoring, search and source browser regressions")
    assert "if" not in scoring and "continue-on-error" not in scoring
    assert "node scripts/run-app-validation.mjs" in scoring["run"]


@pytest.mark.parametrize("fail_index", [None, 0, 9, 19])
def test_shared_production_regressions_preserve_process_isolation_and_stop_on_failure(tmp_path, fail_index):
    script = (ROOT / "scripts/run-core-regressions.mjs").read_text()
    tests = re.findall(r'"(scripts/test-[\w-]+\.mjs)"', script)
    assert len(tests) == 20
    assert (ROOT / "scripts/run-app-validation.mjs").read_text().count('"run-core-regressions"') == 1
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
