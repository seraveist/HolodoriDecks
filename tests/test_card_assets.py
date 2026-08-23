from __future__ import annotations

import json
import py_compile
from dataclasses import dataclass
from pathlib import Path

from holodori_decksim.card_assets import (
    audit_portraits,
    catalog_entry_score,
    find_catalog_candidates,
    image_candidate_score,
)

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class FakeEntry:
    name: str
    objectName: str = ""


@dataclass
class FakeCatalog:
    assetBundles: list[FakeEntry]


def test_card_asset_sync_cli_compiles() -> None:
    py_compile.compile(str(ROOT / "scripts" / "sync-card-assets.py"), doraise=True)


def test_audit_portraits_only_requires_rarity_4_and_5(tmp_path: Path) -> None:
    cards = [
        {"id": "card-r3", "rarity": 3, "asset_id": "r3-asset"},
        {"id": "card-r4", "rarity": 4, "asset_id": "r4-asset"},
        {"id": "card-r5", "rarity": 5, "asset_id": "r5-asset"},
    ]
    cards_path = tmp_path / "cards.json"
    cards_path.write_text(json.dumps(cards), encoding="utf-8")
    assets_dir = tmp_path / "cards"
    assets_dir.mkdir()
    (assets_dir / "card-r4.webp").write_bytes(b"existing")

    result = audit_portraits(cards_path, assets_dir)

    assert result["target_count"] == 2
    assert result["existing_count"] == 1
    assert result["missing_count"] == 1
    assert [row["id"] for row in result["missing"]] == ["card-r5"]


def test_catalog_matching_prefers_static_card_bundle() -> None:
    asset_id = "00010-5-uniq-0069-00"
    static = FakeEntry("assetbundle/card/00010-5-uniq-0069-00/illustration")
    generic = FakeEntry("assetbundle/card/00010-5-uniq-0069-00")
    movie = FakeEntry("assetbundle/card/00010-5-uniq-0069-00/movie")
    structural = FakeEntry("assetbundle/card/00010/0069/main")
    unrelated = FakeEntry("assetbundle/card/00011-5-uniq-0011-00")
    catalog = FakeCatalog([movie, unrelated, structural, generic, static])

    matches = find_catalog_candidates(catalog, asset_id)

    assert matches[0] is static
    assert generic in matches
    assert structural in matches
    assert unrelated not in matches
    assert catalog_entry_score(static, asset_id) > catalog_entry_score(movie, asset_id)


def test_image_candidate_prefers_matching_large_sprite() -> None:
    asset_id = "04001-5-uniq-0071-00"
    matching = image_candidate_score(
        "card_04001-5-uniq-0071-00_illustration",
        "Sprite",
        1024,
        1024,
        asset_id,
    )
    generic = image_candidate_score("texture_main", "Texture2D", 2048, 2048, asset_id)
    icon = image_candidate_score("card_04001_0071_icon", "Sprite", 256, 256, asset_id)
    tiny = image_candidate_score("card_04001_0071_main", "Sprite", 64, 64, asset_id)

    assert matching > generic
    assert matching > icon
    assert tiny < 0
