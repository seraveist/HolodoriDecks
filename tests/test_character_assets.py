import hashlib
import json
from types import SimpleNamespace

import pytest
from PIL import Image

import holodori_decksim.character_assets as assets
from holodori_decksim.card_assets import ImageCandidate
from holodori_decksim.automation_gate import evaluate_portrait_asset_gate


@pytest.fixture
def source(tmp_path, monkeypatch):
    characters = tmp_path / "characters.json"
    characters.write_text(json.dumps([
        {"id": f"chr-{n:05}", "asset_id": f"{n:05}", "board_layout_id": "tree"} for n in range(1, 4)
    ] + [{"id": "chr-00099", "asset_id": "00099"}]))
    output = tmp_path / "characters"
    provenance = tmp_path / "provenance.json"
    raw = b"encrypted bundle"
    entries = [SimpleNamespace(name=f"img_chr_icon_normal_{n:05}", url=f"https://example.invalid/{n}",
                               size=len(raw), md5=hashlib.md5(raw).hexdigest()) for n in (1, 2)]
    catalog = SimpleNamespace(revisionId=80, assetBundles=entries, required=lambda *_: [])
    requests = []

    class Client:
        def __init__(self, **_): pass
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def get(self, url):
            requests.append(url)
            return SimpleNamespace(content=raw, raise_for_status=lambda: None)

    monkeypatch.setattr(assets, "_runtime_dependencies", lambda: (
        SimpleNamespace(Client=Client), None, Image, SimpleNamespace(get=lambda _: catalog),
        SimpleNamespace(decrypt=lambda data, name: name.encode()),
    ))
    monkeypatch.setattr(assets, "_extract_image_candidates", lambda unity, payloads: [
        ImageCandidate(payloads[0].decode(), "Texture2D", 256, 256, Image.new("RGBA", (256, 256), "blue"))
    ])
    return {"characters_path": characters, "assets_dir": output, "provenance_path": provenance}, entries, requests


def test_partial_icons_retry_without_rewriting_existing(source):
    args, entries, requests = source
    report = assets.sync_missing_portraits(**args)
    assert report["before"]["target_count"] == 3
    assert (report["imported_count"], report["pending_count"], report["error_count"]) == (2, 1, 0)
    original = args["provenance_path"].read_bytes()
    report = assets.sync_missing_portraits(**args)
    assert report["imported_count"] == 0
    assert len(requests) == 2
    assert args["provenance_path"].read_bytes() == original
    entries.append(SimpleNamespace(**{**vars(entries[0]), "name": "img_chr_icon_normal_00003"}))
    report = assets.sync_missing_portraits(**args)
    assert report["after"]["missing_count"] == 0
    assert [row["id"] for row in report["imported"]] == ["chr-00003"]


def test_complete_icons_do_not_require_network_or_asset_tool(source, monkeypatch):
    args, _, _ = source
    args["assets_dir"].mkdir()
    for n in range(1, 4):
        Image.new("RGB", (256, 256)).save(args["assets_dir"] / f"chr-{n:05}.webp")
    monkeypatch.setattr(assets, "_runtime_dependencies", lambda: pytest.fail("Should not load optional dependencies"))
    assert assets.sync_missing_portraits(**args)["imported_count"] == 0


def test_corrupt_download_preserves_old_file_and_other_imports(source):
    args, entries, _ = source
    args["assets_dir"].mkdir()
    previous = args["assets_dir"] / "chr-00001.webp"
    previous.write_bytes(b"previous corrupt icon")
    entries[0].md5 = "0" * 32
    report = assets.sync_missing_portraits(**args)
    assert report["error_count"] == 1
    assert [row["id"] for row in report["imported"]] == ["chr-00002"]
    assert previous.read_bytes() == b"previous corrupt icon"
    assert "integrity mismatch" in report["unresolved"][0]["reason"]
    assert not list(args["assets_dir"].glob("*.tmp"))


def test_wrong_image_class_is_rejected(source, monkeypatch):
    args, _, _ = source
    monkeypatch.setattr(assets, "_extract_image_candidates", lambda *_: [
        ImageCandidate("card_illustration", "Texture2D", 256, 256, Image.new("RGB", (256, 256)))
    ])
    result = assets.sync_missing_portraits(**args)
    assert result["error_count"] == 2
    assert result["imported_count"] == 0


def test_source_outage_produces_retryable_report(source, monkeypatch):
    args, _, _ = source
    def outage(): raise TimeoutError("source unavailable")
    monkeypatch.setattr(assets, "_runtime_dependencies", outage)
    result = assets.sync_missing_portraits(**args)
    assert result["error_count"] == 3
    assert result["after"]["missing_count"] == 3


def test_invalid_master_identity_rejected(source):
    args, _, _ = source
    args["characters_path"].write_text(json.dumps([{"id": "../outside", "asset_id": "00001", "board_layout_id": "tree"}]))
    with pytest.raises(ValueError): assets.sync_missing_portraits(**args)


def test_combined_gate_keeps_independent_exact_path_checks():
    card_report = {"imported_count": 1, "imported": [{"id": "card-one"}]}
    member_report = {"imported_count": 1, "imported": [{"id": "chr-00001"}]}
    diff = ["A\tassets/cards/card-one.webp", "A\tassets/characters/chr-00001.webp", "M\tassets/character-portrait-sync.json"]
    check = lambda lines: evaluate_portrait_asset_gate(report=card_report, character_report=member_report, diff_lines=lines)
    assert check(diff).safe
    assert not check(diff[:1]).safe
    assert not check(diff + ["D\tassets/characters/chr-00002.webp"]).safe
    assert not check(diff + ["M\tjs/score.js"]).safe
    assert not check([row.replace("chr-00001", "chr-00002") for row in diff]).safe
