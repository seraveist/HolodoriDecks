"""Run live-sync control flow against deterministic catalogue/SUS fixtures."""
import copy
import hashlib
import json
import sys
from types import SimpleNamespace

import pytest

from holodori_decksim import chart_assets as assets
from holodori_decksim import sync


@pytest.fixture
def chart_sync(tmp_path, monkeypatch):
    generated = tmp_path / "data/generated"
    generated.mkdir(parents=True)
    state = SimpleNamespace(
        root=tmp_path, generated=generated, revision=103, commit="a" * 40,
        master_version="b" * 64, parsed=0, verified=0, decrypted=0,
        bad_hash=False, bad_size=False, bad_host=False, bad_header=False,
        timeline={"notes": [["tap", 10.0]], "skills": [
            {"skill_slot_no": slot, "time": float(slot), "skill_starts_at_combo": 0}
            for slot in range(1, 6)], "fever": {"start": 6.0, "end": 9.0}},
    )

    def resource():
        values = {f"{name}_NOTE_COUNT": "0" for name in assets.COUNTS.values()}
        values.update(MUSIC_ID="m9999" if state.bad_header else "m0001",
                      FULL_COMBO_NOTE_COUNT="1", NORMAL_NOTE_COUNT="1")
        # The fixture parser reads the timeline from the actual hashed SUS bytes.
        return ("\n".join(f"#{name} {value}" for name, value in values.items())
                + "\n#FIXTURE " + json.dumps(state.timeline)).encode()

    def fetch(**kwargs):
        raw = resource()
        entry = SimpleNamespace(
            name="chart_m0001_easy.sus", size=len(raw) + int(state.bad_size),
            md5="0" * 32 if state.bad_hash else hashlib.md5(raw).hexdigest(),
            url="https://untrusted.example/chart" if state.bad_host else
                "https://asset.game-hololive-dreams.com/chart.sus",
        )
        return SimpleNamespace(revisionId=state.revision, resources=[entry])

    class Master:
        def __init__(self, commit):
            self.version = state.master_version

        def table(self, name):
            data = {"fullComboNoteCount": 1} if name == "MusicDifficultyChart.json" else {
                "chartAssetId": "chart_m0001_easy"}
            return json.dumps([{"music_id": "m0001", "difficulty_type": 1, "data": data}]), "digest"

    def decrypt(raw, name):
        state.decrypted += 1
        return raw

    def load_sus(path):
        state.parsed += 1
        return json.loads(path.read_text().split("\n#FIXTURE ")[1]), None

    verify = assets.verify_resource

    def verified(*args):
        state.verified += 1
        return verify(*args)

    for name, module in {
        "holodori_asset_tools": SimpleNamespace(catalog=SimpleNamespace(fetch=fetch)),
        "holodori_asset_tools.crypto": SimpleNamespace(),
        "holodori_asset_tools.crypto.resource": SimpleNamespace(decrypt=decrypt),
        "holodori": SimpleNamespace(),
        "holodori.scores": SimpleNamespace(load_sus=load_sus, chart_metadata=lambda score, lengths: score),
        "httpx": SimpleNamespace(HTTPError=OSError),
    }.items():
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.setattr(assets, "AndroidMaster", Master)
    monkeypatch.setattr(assets, "request_bytes", lambda url: resource())
    monkeypatch.setattr(assets, "verify_resource", verified)
    state.run = lambda: assets.sync_chart_assets(state.commit, root=tmp_path)
    state.observation = lambda: json.loads((tmp_path / ".local/chart-assets/catalog-observation.json").read_text())
    assert state.run() is True
    return state


def published_bytes(root):
    return {str(path.relative_to(root)): path.read_bytes() for path in (root / "data").rglob("*") if path.is_file()}


def test_revision_only_runs_preserve_every_published_byte_and_still_verify(chart_sync, capsys):
    state = chart_sync
    before = published_bytes(state.root)
    for revision in (105, 108, 108):
        state.revision = revision
        assert state.run() is False
        assert published_bytes(state.root) == before
        assert state.observation()["catalogRevision"] == revision
        assert state.observation()["decision"] == "metadata-only"
    assert state.verified == state.decrypted == 4
    assert state.parsed == 1  # existing compatible local timeline is retained
    assert "verified catalogue r108; committed r103" in capsys.readouterr().err


def test_identical_payload_is_unchanged(chart_sync):
    assert chart_sync.run() is False
    assert chart_sync.observation()["decision"] == "unchanged"


@pytest.mark.parametrize("kind", ["notes", "SP", "Fever"])
@pytest.mark.parametrize("revision", [103, 108])
def test_same_combo_count_with_changed_chart_bytes_rebuilds_timeline(chart_sync, kind, revision):
    state = chart_sync
    path = state.generated / "charts/m0001-EASY.json"
    before = json.loads(path.read_text())
    state.revision = revision
    if kind == "notes":
        state.timeline["notes"][0][1] = 10.5
    elif kind == "SP":
        state.timeline["skills"][0]["time"] = 1.5
    else:
        state.timeline["fever"]["end"] = 9.5
    assert state.run() is True
    after = json.loads(path.read_text())
    assert before["chartHash"] != after["chartHash"]
    assert before["susSha256"] != after["susSha256"]
    assert before["fullComboNoteCount"] == after["fullComboNoteCount"] == 1
    field = {"notes": "notes", "SP": "skills", "Fever": "fever"}[kind]
    assert before[field] != after[field]
    assert state.parsed == 2
    assert json.loads((state.generated / "chart-assets.json").read_text())["catalogRevision"] == revision


@pytest.mark.parametrize("field", ["source_commit", "master_version", "assetToolCommit", "version", "unknown"])
def test_only_catalogue_revision_is_ignored(chart_sync, field):
    path = chart_sync.generated / "chart-assets.json"
    old = json.loads(path.read_text())
    old[field] = "different"
    path.write_text(json.dumps(old))
    assert chart_sync.run() is True


def test_missing_local_timeline_is_repaired_even_with_identical_asset_payload(chart_sync):
    path = chart_sync.generated / "charts/m0001-EASY.json"
    before = path.read_bytes()
    path.unlink()
    assert chart_sync.run() is True
    assert path.read_bytes() == before


@pytest.mark.parametrize("floor", ["committed", "observed"])
def test_revision_regression_is_fatal_even_after_an_ignored_revision(chart_sync, floor):
    state = chart_sync
    if floor == "observed":
        state.revision = 108
        assert state.run() is False
        state.revision = 105
    else:
        state.revision = 102
        # A missing cache cannot weaken the committed floor.
        (state.root / ".local/chart-assets/catalog-observation.json").unlink()
    before = published_bytes(state.root)
    with pytest.raises(ValueError, match="revision regressed"):
        state.run()
    assert published_bytes(state.root) == before


@pytest.mark.parametrize("failure,match", [
    ("bad_hash", "MD5"), ("bad_size", "size"), ("bad_host", "Untrusted"), ("bad_header", "identity"),
])
def test_revision_bump_does_not_hide_integrity_failures_or_advance_observation(chart_sync, failure, match):
    state = chart_sync
    state.revision = 108
    setattr(state, failure, True)
    before = published_bytes(state.root)
    with pytest.raises(ValueError, match=match):
        state.run()
    assert published_bytes(state.root) == before
    assert state.observation()["catalogRevision"] == 103


@pytest.mark.parametrize("master_changed", [False, True])
def test_sync_orchestration_skips_metadata_writes_but_keeps_independent_master_triggers(chart_sync, monkeypatch, master_changed):
    state = chart_sync
    state.revision = 108
    for filename in ("sync_state.json", "upstream.json", "generated/i18n/manifest.json"):
        path = state.root / "data" / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"keep": "published provenance"}\n')
    before = published_bytes(state.root)
    snapshot = {"changed": master_changed, "upstream_commit": state.commit,
                "master_version": state.master_version, "locales": {},
                "changed_refs": ["master_version"] if master_changed else []}
    monkeypatch.setattr(sync, "_resolve_snapshot", lambda **kwargs: copy.deepcopy(snapshot))
    original = assets.sync_chart_assets
    monkeypatch.setattr(assets, "sync_chart_assets", lambda commit: original(commit, root=state.root))
    calls = []
    monkeypatch.setattr(sync, "normalize", lambda snapshot: calls.append("normalize") or {"cards": 1})
    monkeypatch.setattr(sync, "_write_sync_metadata", lambda *args: calls.append("metadata"))
    result = sync.sync()
    assert result["changed"] is master_changed
    assert result["changed_refs"] == snapshot["changed_refs"]
    assert calls == (["normalize", "metadata"] if master_changed else [])
    assert published_bytes(state.root) == before
