import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
GENERATED = ROOT / "data" / "generated"


def test_rarity_4_and_5_portraits_are_complete() -> None:
    provenance = json.loads((ASSETS / "card-portrait-source.json").read_text(encoding="utf-8"))
    cards = json.loads((GENERATED / "cards.json").read_text(encoding="utf-8"))

    expected = {card["id"] for card in cards if card.get("rarity") in {4, 5}}
    excluded_r3 = {card["id"] for card in cards if card.get("rarity") == 3}
    present = {path.stem for path in (ASSETS / "cards").glob("*.webp")}

    assert provenance["included_rarities"] == [4, 5]
    assert provenance["portrait_count"] == len(expected) == 115
    assert present == expected
    assert present.isdisjoint(excluded_r3)
    assert (ASSETS / "cards" / "card-06004-5-uniq-0060-00.webp").exists()


def test_ui_manifest_references_existing_files() -> None:
    manifest = json.loads((ASSETS / "ui" / "manifest.json").read_text(encoding="utf-8"))

    paths = []
    paths.extend(item["icon"] for item in manifest["attributes"].values())
    paths.extend(manifest["score_ranks"].values())

    for relative_path in paths:
        assert (ROOT / relative_path).exists(), relative_path


def test_expected_attribute_and_rank_keys_are_available() -> None:
    manifest = json.loads((ASSETS / "ui" / "manifest.json").read_text(encoding="utf-8"))
    assert set(manifest["attributes"]) == {"1", "2", "3"}
    assert set(manifest["score_ranks"]) == {"D", "C", "B", "A", "S"}
    assert manifest["card_portrait"]["rarities"] == [4, 5]
