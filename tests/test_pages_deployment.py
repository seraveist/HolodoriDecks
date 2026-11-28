import importlib.util
from pathlib import Path

import pytest


path = Path(__file__).resolve().parents[1] / "scripts/ensure-pages-deployment.py"
spec = importlib.util.spec_from_file_location("pages_deployment_test", path)
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


def run(sha, *, status="completed", conclusion="success", updated="2026-09-08T01:00:00Z"):
    return {"head_sha": sha, "status": status, "conclusion": conclusion, "updated_at": updated}


@pytest.mark.parametrize("live,runs,expected", [
    (None, [], "deployment-needed"),
    ("current", [], "already-deployed"),
    ("old", [run("current")], "deployment-needed"),  # Later deployment reverted the live site.
    ("current", [run("current", conclusion="failure")], "already-deployed"),  # Smoke failed after publishing.
    ("old", [run("current", status="queued", conclusion=None)], "deployment-active"),
    (None, [run("current", status="in_progress", conclusion=None)], "deployment-active"),
    ("old", [run("old", status="in_progress", conclusion=None)], "deployment-needed"),
])
def test_live_revision_controls_recovery_with_active_dispatch_deduplication(live, runs, expected):
    calls = []
    def api(path, *, method="GET", payload=None):
        calls.append((path, method, payload))
        if path.endswith("commits/main"):
            return {"sha": "current"}
        if method == "GET":
            return {"workflow_runs": runs}
    result = deployment.ensure_pages_deployment("owner/repo", api=api, observe=lambda: live)
    assert result["reason"] == expected
    assert result["live_sha"] == live
    assert result["dispatched"] is (expected == "deployment-needed")
    dispatches = [call for call in calls if call[1] == "POST"]
    assert dispatches == ([("repos/owner/repo/actions/workflows/pages.yml/dispatches", "POST", {"ref": "main"})]
                          if result["dispatched"] else [])
    if live == "current":
        assert len(calls) == 1  # No Actions API polling for a healthy site.
