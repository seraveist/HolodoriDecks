import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def test_initial_card_portrait_baseline_is_present() -> None:
    provenance = json.loads((ASSETS / "card-portrait-source.json").read_text(encoding="utf-8"))
    portraits = list((ASSETS / "cards").glob("*.webp"))

    assert provenance["imported_count"] == 115
    assert provenance["missing_count"] == 54
    assert len(portraits) >= provenance["imported_count"]
    assert (ASSETS / "cards" / "card-06004-5-uniq-0060-00.webp").exists()


def test_ui_manifest_references_existing_files() -> None:
    manifest = json.loads((ASSETS / "ui" / "manifest.json").read_text(encoding="utf-8"))

    paths = []
    paths.extend(item["icon"] for item in manifest["attributes"].values())
    paths.extend(manifest["score_ranks"].values())
    paths.extend(manifest["placeholders"].values())

    for relative_path in paths:
        assert (ROOT / relative_path).exists(), relative_path


def test_expected_attribute_and_rank_keys_are_available() -> None:
    manifest = json.loads((ASSETS / "ui" / "manifest.json").read_text(encoding="utf-8"))
    assert set(manifest["attributes"]) == {"1", "2", "3"}
    assert set(manifest["score_ranks"]) == {"D", "C", "B", "A", "S"}
