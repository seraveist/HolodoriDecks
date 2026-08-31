import pytest

pytest.importorskip("hanja", reason="music-search extra is not installed")
pytest.importorskip("pykakasi", reason="music-search extra is not installed")

from holodori_decksim.music_search import (
    build_music_search_index,
    korean_hanja_kana_alias,
    romanize_japanese,
    transcribe_japanese_to_hangul,
)


def test_japanese_search_alias_transforms() -> None:
    assert "shukusei" in romanize_japanese("シュクセイ").lower()
    assert transcribe_japanese_to_hangul("モグモグ") == "모구모구"
    assert transcribe_japanese_to_hangul("セイモグモグ") == "세이모구모구"
    mixed = korean_hanja_kana_alias("聖モグ神")
    assert "성" in mixed
    assert "모구" in mixed
    assert "신" in mixed


def test_music_search_index_contains_multilingual_aliases() -> None:
    music = [{"id": "m-test", "title": "fallback", "singer_name": "fallback singer"}]
    packs = {
        "ko": {
            "la-music_title-m-test": "테스트 곡",
            "la-singer_name-m-test": "오오카미 미오",
        },
        "en": {
            "la-music_title-m-test": "Test Song",
            "la-music_title_ruby-m-test": "ShukuseiMoguMogu",
            "la-singer_name-m-test": "Ookami Mio",
            "la-singer_name_ruby-m-test": "OokamiMio",
        },
        "ja": {
            "la-music_title-m-test": "聖モグモグ",
            "la-music_title_ruby-m-test": "セイモグモグ",
            "la-singer_name-m-test": "大神ミオ",
            "la-singer_name_ruby-m-test": "オオカミミオ",
        },
    }
    index = build_music_search_index(music, packs)
    item = index["items"]["m-test"]
    aliases = item["aliases"]
    assert item["sort_key"] == "ShukuseiMoguMogu"
    assert "Test Song" in aliases
    assert "聖モグモグ" in aliases
    assert "테스트 곡" in aliases
    assert any("성" in alias and "모구" in alias for alias in aliases)
    assert any("세이" in alias and "모구" in alias for alias in aliases)
