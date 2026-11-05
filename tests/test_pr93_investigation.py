"""Read-only live-audit trust boundaries and tracing parity."""
import hashlib
from collections import Counter
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from test_chart_parser_regression import sus_fixture
from holodori_decksim.chart_parser import repair_verified_chart


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


@pytest.mark.parametrize("second_width", [1, 2])
def test_single_marker_labels_only_one_overlapping_width_matched_end(second_width):
    pytest.importorskip("holodori.scores")
    from holodori.scores import chart_metadata, load_sus
    from io import StringIO
    from sonolus_converters.notes.slide import Slide
    module = load_investigation()
    text = sus_fixture(direction="1").decode().replace("#00152:11", f"#00152:1{second_width}")
    text += f"#000381:1{second_width}\n#001321:2{second_width}\n"
    score, lengths = load_sus(StringIO(text))
    before = chart_metadata(score, lengths)
    corrected, changes = module.candidate.candidate_score(score, text, lengths)
    after = chart_metadata(corrected, lengths)
    before_counts = Counter(k for k, _ in before["notes"])
    counts = Counter(k for k, _ in after["notes"])
    assert before_counts["long_flick_end"] == 2
    assert counts["long_flick_end"] == counts["long_end"] == 1
    assert [t for _, t in before["notes"]] == [t for _, t in after["notes"]]
    assert before["skills"] == after["skills"]
    assert before["fever"] == after["fever"]
    assert len(changes) == 1 and changes[0]["reclassifiedEnds"] == 1
    ends = [note.connections[-1] for note in corrected.notes if isinstance(note, Slide)]
    selected = next(end for end in ends if end.direction)
    assert round(selected.size * 2) == second_width
    assert chart_metadata(score, lengths) == before  # input score was not mutated


def test_non_overlapping_chart_is_unchanged_by_candidate():
    pytest.importorskip("holodori.scores")
    from holodori.scores import chart_metadata, load_sus
    from io import StringIO
    module = load_investigation()
    text = sus_fixture(direction="1").decode()
    score, lengths = load_sus(StringIO(text))
    corrected, changes = module.candidate.candidate_score(score, text, lengths)
    assert changes == []
    assert chart_metadata(score, lengths) == chart_metadata(corrected, lengths)


def test_production_repair_refuses_unknown_chart_or_changed_source():
    raw = sus_fixture()
    sentinel = object()
    for chart in ({"musicId": "m9999", "difficulty": "EXPERT"},
                  {"musicId": "m0388", "difficulty": "EXPERT"}):
        result, changes = repair_verified_chart(sentinel, raw, [], chart)
        assert result is sentinel and changes == []


def test_source_scoped_repair_uses_original_validator_after_correction(monkeypatch):
    pytest.importorskip("holodori.scores")
    from io import StringIO
    from holodori.scores import chart_metadata, load_sus
    from holodori_decksim import chart_parser
    from holodori_decksim.chart_assets import headers, validate_timeline
    raw = sus_fixture(direction="1").decode()
    raw = raw.replace("#FULL_COMBO_NOTE_COUNT 9", "#FULL_COMBO_NOTE_COUNT 18")
    raw = raw.replace("#LONG_START_NOTE_COUNT 1", "#LONG_START_NOTE_COUNT 2")
    raw = raw.replace("#LONG_CONTINUE_NOTE_COUNT 7", "#LONG_CONTINUE_NOTE_COUNT 14")
    raw = raw.replace("#LONG_END_NOTE_COUNT 0", "#LONG_END_NOTE_COUNT 1")
    raw = (raw + "#000381:11\n#001321:21\n").encode()
    chart = {"musicId": "m9999", "difficulty": "EXPERT", "fullComboNoteCount": 18}
    values = headers(raw, "m9999", 18)
    score, lengths = load_sus(StringIO(raw.decode()))
    with pytest.raises(ValueError, match="long_end"):
        validate_timeline(chart_metadata(score, lengths), chart, values)
    monkeypatch.setitem(chart_parser.VERIFIED_SOURCES, "m9999:EXPERT", hashlib.sha256(raw).hexdigest())
    corrected, changes = chart_parser.repair_verified_chart(score, raw, lengths, chart)
    assert changes[0]["reclassifiedEnds"] == 1
    result = validate_timeline(chart_metadata(corrected, lengths), chart, values)
    assert len(result["notes"]) == 18
