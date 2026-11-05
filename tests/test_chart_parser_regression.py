"""Synthetic SUS contracts; no game chart is approved by these fixtures.

The sync job installs the pinned parser/converter before running this module.
Core-only installations can still run the independent validator tests below.
"""
import copy
import hashlib
import importlib.util
from io import StringIO
from pathlib import Path

import pytest

from holodori_decksim.chart_assets import COUNTS, headers, validate_timeline


def sus_fixture(*, direction=None, critical=False, damage=0, ghost=0):
    counts = dict.fromkeys(COUNTS.values(), 0)
    counts.update(LONG_START=1, LONG_CONTINUE=7)
    counts["LONG_FLICK_END" if direction else "LONG_END"] = 1
    values = {"MUSIC_ID": "m9999", "FULL_COMBO_NOTE_COUNT": "9",
              "DAMAGE_NOTE_COUNT": str(damage), "GHOST_NOTE_COUNT": str(ghost)}
    values.update({f"{name}_NOTE_COUNT": str(value) for name, value in counts.items()})
    lines = [f"#{name} {value}" for name, value in values.items()]
    lines += ["#BPM01:120", "#00008:01", "#000320:11", "#001320:21"]
    lines += [f"#SP_SKILL 000 {slot - 1}/4 {slot}" for slot in range(1, 5)]
    lines += ["#SP_SKILL 001 0/1 5", "#0000C:0102", "#0010D:0102"]
    if direction:
        lines += [f"#00152:{direction}1"]
    if critical:
        lines += ["#00112:21"]
    if damage:
        lines += ["#00016:41"]
    if ghost:
        lines += ["#COLOR0001:ffffff80", "#0009200001:11", "#0019200001:21"]
    return ("\n".join(lines) + "\n").encode()


def parse(raw):
    parser = pytest.importorskip("holodori.scores")
    return parser.chart_metadata(*parser.load_sus(StringIO(raw.decode())))


CHART = {"musicId": "m9999", "fullComboNoteCount": 9}


@pytest.mark.parametrize("direction", [None, "1", "3", "4"])
@pytest.mark.parametrize("critical", [False, True])
def test_pinned_parser_end_categories_times_and_sp(direction, critical):
    raw = sus_fixture(direction=direction, critical=critical)
    meta = parse(raw)
    result = validate_timeline(meta, CHART, headers(raw, "m9999", 9))
    kind = ("critical_" if critical else "") + ("long_flick_end" if direction else "long_end")
    assert result["notes"][-1] == [kind, 2.0]
    assert [time for _, time in result["notes"]] == [index / 4 for index in range(9)]
    assert [skill["combo"] for skill in result["skills"]] == [0, 2, 4, 6, 8]
    assert [skill["time"] for skill in result["skills"]] == [0, 0.5, 1, 1.5, 2]
    assert result["fever"] == {"start": 2.0, "end": 3.0}


def test_equal_total_and_timestamps_do_not_allow_end_reclassification():
    raw = sus_fixture()
    ordinary = parse(raw)
    flick = parse(sus_fixture(direction="1"))
    assert len(ordinary["notes"]) == len(flick["notes"]) == 9
    assert [time for _, time in ordinary["notes"]] == [time for _, time in flick["notes"]]
    # Deliberately pair the wrong classification with the ordinary SUS counts.
    # This recreates the rejection mechanism, not any of the six real charts.
    with pytest.raises(ValueError, match="parser long_end count differs") as error:
        validate_timeline(flick, CHART, headers(raw, "m9999", 9))
    assert "long_end=parsed:0/sus:1" in str(error.value)
    assert "long_flick_end=parsed:1/sus:0" in str(error.value)


@pytest.mark.parametrize("damage,ghost", [(1, 0), (0, 2), (1, 2)])
def test_pinned_parser_special_notes_still_fail_closed(damage, ghost):
    raw = sus_fixture(damage=damage, ghost=ghost)
    meta = parse(raw)
    assert len(meta["notes"]) == 9
    with pytest.raises(ValueError, match="unsupported damage/ghost notes") as error:
        validate_timeline(meta, CHART, headers(raw, "m9999", 9))
    assert f"damage={damage}, ghost={ghost}" in str(error.value)


def valid_metadata():
    return {"notes": [["long_start", 0.0]] + [
        ["long_continuation", index / 4] for index in range(1, 8)
    ] + [["long_end", 2.0]], "skills": [
        {"skill_slot_no": slot, "time": (slot - 1) / 2, "skill_starts_at_combo": (slot - 1) * 2}
        for slot in range(1, 6)], "fever": {"start": 2.0, "end": 3.0}}


@pytest.mark.parametrize("failure", ["missing", "slot_order", "same_time", "decreasing_combo", "combo_range", "nan"])
def test_sp_guards_remain_required(failure):
    meta = valid_metadata()
    if failure == "missing":
        meta["skills"].pop()
    elif failure == "slot_order":
        meta["skills"][0]["skill_slot_no"] = 2
    elif failure == "same_time":
        meta["skills"][1]["time"] = 0
    elif failure == "decreasing_combo":
        meta["skills"][2]["skill_starts_at_combo"] = 1
    elif failure == "combo_range":
        meta["skills"][4]["skill_starts_at_combo"] = 10
    else:
        meta["skills"][0]["time"] = float("nan")
    with pytest.raises(ValueError, match="SP"):
        validate_timeline(meta, CHART, headers(sus_fixture(), "m9999", 9))


@pytest.mark.parametrize("failure", ["lost_note", "unknown_kind", "nan_time", "negative_time", "out_of_order", "bad_fever"])
def test_note_and_fever_guards_remain_required(failure):
    meta = valid_metadata()
    if failure == "lost_note":
        meta["notes"].pop()
    elif failure == "unknown_kind":
        meta["notes"][0][0] = "damage"
    elif failure == "nan_time":
        meta["notes"][0][1] = float("nan")
    elif failure == "negative_time":
        meta["notes"][0][1] = -1
    elif failure == "out_of_order":
        meta["notes"].reverse()
    else:
        meta["fever"]["end"] = meta["fever"]["start"]
    with pytest.raises(ValueError):
        validate_timeline(meta, CHART, headers(sus_fixture(), "m9999", 9))


def test_validation_does_not_repair_or_mutate_parser_output():
    meta = valid_metadata()
    meta["notes"][-1][0] = "long_flick_end"
    before = copy.deepcopy(meta)
    with pytest.raises(ValueError, match="long_end"):
        validate_timeline(meta, CHART, headers(sus_fixture(), "m9999", 9))
    assert meta == before


def audit_module():
    path = Path(__file__).resolve().parents[1] / "scripts/audit-chart-timelines.py"
    spec = importlib.util.spec_from_file_location("chart_timeline_audit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("source_hash", [None, "0" * 64])
def test_offline_audit_refuses_unverified_bytes_before_parsing(source_hash):
    raw = sus_fixture()
    calls = []
    chart = {**CHART, "susSha256": source_hash}
    with pytest.raises(ValueError, match="SUS SHA-256"):
        audit_module().audit_raw(raw, chart, parser=lambda data: calls.append(data))
    assert calls == []


def test_offline_audit_reports_special_rejection_without_publishing():
    raw = sus_fixture(ghost=2)
    chart = {**CHART, "susSha256": hashlib.sha256(raw).hexdigest()}
    result = audit_module().audit_raw(raw, chart, parser=lambda data: valid_metadata())
    assert result["status"] == "rejected"
    assert result["sourceVerifiedAgainstCommittedSusSha256"] is True
    assert result["specialNoteCounts"] == {"damage": 0, "ghost": 2}
    assert "notes" not in result


def test_offline_audit_requires_the_pinned_installed_tool_revisions(monkeypatch):
    module = audit_module()
    class WrongDistribution:
        def read_text(self, name):
            return '{"vcs_info":{"commit_id":"wrong"}}'
    monkeypatch.setattr(module, "distribution", lambda name: WrongDistribution())
    with pytest.raises(ValueError, match="tool revision"):
        module.require_pinned_toolchain()
