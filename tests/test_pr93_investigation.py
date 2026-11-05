"""Read-only live-audit trust boundaries and tracing parity."""
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from test_chart_parser_regression import sus_fixture


def load_investigation():
    file = Path(__file__).resolve().parents[1] / "scripts/investigate-pr93-exact.py"
    spec = importlib.util.spec_from_file_location("pr93_investigation", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_fixture():
    raw = sus_fixture()
    entry = SimpleNamespace(name="chart_m9999_expert.sus", url="https://asset.game-hololive-dreams.com/example",
                            md5=hashlib.md5(raw).hexdigest(), size=len(raw))
    chart = {"musicId": "m9999", "chartAssetId": "chart_m9999_expert", "fullComboNoteCount": 9,
             "chartHash": entry.md5, "susSha256": hashlib.sha256(raw).hexdigest()}
    return raw, entry, chart


@pytest.mark.parametrize("failure", ["name", "host", "chart_hash", "size", "download_hash", "sus_hash"])
def test_live_source_integrity_failures_cannot_reach_parser(failure):
    module = load_investigation()
    raw, entry, chart = source_fixture()
    downloaded = raw
    if failure == "name":
        entry.name = "other.sus"
    elif failure == "host":
        entry.url = "https://untrusted.example/example"
    elif failure == "chart_hash":
        entry.md5 = "0" * 32
    elif failure == "size":
        entry.size += 1
    elif failure == "download_hash":
        downloaded += b"bad"
    else:
        chart["susSha256"] = "0" * 64
    with pytest.raises(ValueError):
        module.verified_source(entry, chart, download=lambda url: downloaded, decrypt=lambda data, name: data)


def test_live_source_accepts_only_exact_verified_bytes():
    module = load_investigation()
    raw, entry, chart = source_fixture()
    assert module.verified_source(entry, chart, download=lambda url: raw, decrypt=lambda data, name: data) == raw


@pytest.mark.parametrize("direction", [None, "1", "3", "4"])
def test_trace_preserves_pinned_metadata_and_identifies_endpoint_markers(direction):
    pytest.importorskip("holodori.scores")
    module = load_investigation()
    raw = sus_fixture(direction=direction)
    meta, trace = module.traced_parse(raw)
    assert meta == module.audit.parse_sus(raw)
    assert trace["pairedSlides"] == 1
    assert trace["rawLongKindsBeforePairing"] == {"1": 1, "2": 1}
    end = trace["endpoints"][0]
    assert (end["tick"], end["lane"], end["width"]) == (1920, 2, 1)
    assert end["direction"] == {None: None, "1": "up", "3": "left", "4": "right"}[direction]
    assert end["directionalMarkers"] == ([] if not direction else [{"kind": int(direction), "width": 1}])
    assert module.sp_checks(meta)["passed"] is True


def test_investigation_workflow_has_no_write_permissions_or_source_uploads():
    file = Path(__file__).resolve().parents[1] / ".github/workflows/investigate-pr93-exact.yml"
    workflow = yaml.safe_load(file.read_text())
    assert workflow["permissions"] == {"contents": "read"}
    job = workflow["jobs"]["investigate"]
    assert job["runs-on"] == "macos-15"
    uploads = [s for s in job["steps"] if "upload-artifact@" in s.get("uses", "")]
    assert len(uploads) == 1
    assert uploads[0]["with"]["path"] == ".local/pr93-investigation/report.json"
    commands = "\n".join(s.get("run", "") for s in job["steps"])
    assert "git diff --exit-code -- data" in commands
    assert "git push" not in commands
    assert "holodori-sync" not in commands
