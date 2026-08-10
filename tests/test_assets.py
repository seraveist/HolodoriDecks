from pathlib import Path

from holodori_decksim.assets import _normalize_token, candidate_score, find_candidates


def test_normalize_token_ignores_separators() -> None:
    assert _normalize_token("06004-5-uniq-0060-00") == "060045uniq006000"
    assert _normalize_token("IMG_CARD_06004-5-UNIQ-0060-00") == "imgcard060045uniq006000"


def test_candidate_score_prefers_exact_stem() -> None:
    exact = Path("06004-5-uniq-0060-00.png")
    prefixed = Path("img_card_06004-5-uniq-0060-00.png")
    nested = Path("cards/06004-5-uniq-0060-00/texture.png")

    assert candidate_score(exact, "06004-5-uniq-0060-00") > candidate_score(
        prefixed, "06004-5-uniq-0060-00"
    )
    assert candidate_score(prefixed, "06004-5-uniq-0060-00") > candidate_score(
        nested, "06004-5-uniq-0060-00"
    )


def test_find_candidates_sorts_best_match_first() -> None:
    images = [
        Path("other.png"),
        Path("img_card_06004-5-uniq-0060-00.png"),
        Path("06004-5-uniq-0060-00.png"),
    ]
    assert find_candidates(images, "06004-5-uniq-0060-00") == [
        Path("06004-5-uniq-0060-00.png"),
        Path("img_card_06004-5-uniq-0060-00.png"),
    ]
