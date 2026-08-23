from __future__ import annotations

import json
from pathlib import Path

from holodori_decksim.public_card_art import (
    PUBLIC_ART_ASSET_CLASS,
    PUBLIC_ART_MANIFEST_PATH,
    PUBLIC_ART_REPOSITORY,
    index_public_art_manifest,
    public_art_asset_path,
    public_art_asset_url,
    public_art_manifest_url,
    snapshot_sync_target_ids,
)


def test_public_art_manifest_indexes_current_new_card_illustration() -> None:
    manifest = {
        "assets": [
            {
                "cardId": "card-00010-5-uniq-0069-00",
                "illustration": {
                    "localPath": "/game/illustrations/card-00010-5-uniq-0069-00.webp",
                    "width": 2101,
                    "height": 1165,
                },
            }
        ]
    }

    indexed = index_public_art_manifest(manifest)

    illustration = indexed["card-00010-5-uniq-0069-00"]["illustration"]
    assert illustration["width"] == 2101
    assert illustration["height"] == 1165


def test_public_art_paths_are_pinned_to_expected_illustration_tree() -> None:
    commit = "c851ccd7e56ad1911724b183d0b695eb65754c98"
    local_path = "/game/illustrations/card-04001-5-uniq-0071-00.webp"

    assert public_art_asset_path(local_path) == (
        "apps/web/public/game/illustrations/card-04001-5-uniq-0071-00.webp"
    )
    assert public_art_asset_url(commit, local_path) == (
        f"https://raw.githubusercontent.com/{PUBLIC_ART_REPOSITORY}/{commit}/"
        "apps/web/public/game/illustrations/card-04001-5-uniq-0071-00.webp"
    )
    assert public_art_manifest_url(commit).endswith(
        f"/{commit}/{PUBLIC_ART_MANIFEST_PATH}"
    )


def test_public_art_path_rejects_square_card_icon_tree() -> None:
    try:
        public_art_asset_path("/game/cards/card-04001-5-uniq-0071-00.webp")
    except ValueError as exc:
        assert "unexpected public card-art path" in str(exc)
    else:
        raise AssertionError("square card icon path should not be accepted as a portrait illustration")


def test_snapshot_sync_targets_include_legacy_square_snapshot_portrait(tmp_path: Path) -> None:
    cards = [
        {
            "id": "card-00010-5-uniq-0069-00",
            "rarity": 5,
            "asset_id": "00010-5-uniq-0069-00",
        },
        {
            "id": "card-00001-5-uniq-0000-00",
            "rarity": 5,
            "asset_id": "00001-5-uniq-0000-00",
        },
    ]
    cards_path = tmp_path / "cards.json"
    cards_path.write_text(json.dumps(cards), encoding="utf-8")
    assets_dir = tmp_path / "cards"
    assets_dir.mkdir()
    (assets_dir / "card-00010-5-uniq-0069-00.webp").write_bytes(b"legacy-square")
    (assets_dir / "card-00001-5-uniq-0000-00.webp").write_bytes(b"bootstrap-landscape")

    provenance = {
        "version": 2,
        "cards": {
            "card-00010-5-uniq-0069-00": {
                "source_type": "public-card-art-snapshot",
                "source_path": "apps/web/public/game/cards/card-00010-5-uniq-0069-00.webp",
                "width": 300,
                "height": 300,
            }
        },
    }
    provenance_path = tmp_path / "provenance.json"
    provenance_path.write_text(json.dumps(provenance), encoding="utf-8")

    targets = snapshot_sync_target_ids(
        cards_path=cards_path,
        assets_dir=assets_dir,
        provenance_path=provenance_path,
    )

    assert targets == ["card-00010-5-uniq-0069-00"]
    assert PUBLIC_ART_ASSET_CLASS == "card-illustration"
