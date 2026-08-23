from __future__ import annotations

from holodori_decksim.public_card_art import (
    PUBLIC_ART_MANIFEST_PATH,
    PUBLIC_ART_REPOSITORY,
    index_public_art_manifest,
    public_art_asset_path,
    public_art_asset_url,
    public_art_manifest_url,
)


def test_public_art_manifest_indexes_current_new_card() -> None:
    manifest = {
        "assets": [
            {
                "cardId": "card-00010-5-uniq-0069-00",
                "icon": {
                    "localPath": "/game/cards/card-00010-5-uniq-0069-00.webp",
                    "width": 300,
                    "height": 300,
                },
            }
        ]
    }

    indexed = index_public_art_manifest(manifest)

    assert indexed["card-00010-5-uniq-0069-00"]["icon"]["width"] == 300


def test_public_art_paths_are_pinned_to_expected_card_tree() -> None:
    commit = "c851ccd7e56ad1911724b183d0b695eb65754c98"
    local_path = "/game/cards/card-04001-5-uniq-0071-00.webp"

    assert public_art_asset_path(local_path) == (
        "apps/web/public/game/cards/card-04001-5-uniq-0071-00.webp"
    )
    assert public_art_asset_url(commit, local_path) == (
        f"https://raw.githubusercontent.com/{PUBLIC_ART_REPOSITORY}/{commit}/"
        "apps/web/public/game/cards/card-04001-5-uniq-0071-00.webp"
    )
    assert public_art_manifest_url(commit).endswith(
        f"/{commit}/{PUBLIC_ART_MANIFEST_PATH}"
    )


def test_public_art_path_rejects_non_card_asset() -> None:
    try:
        public_art_asset_path("/game/illustrations/card-04001-5-uniq-0071-00.webp")
    except ValueError as exc:
        assert "unexpected public card-art path" in str(exc)
    else:
        raise AssertionError("illustration path should not be accepted as a card portrait")
