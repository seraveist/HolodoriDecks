from __future__ import annotations

import re
import unicodedata
from typing import Any

import hanja
from hunmin import transcribe
from pykakasi import kakasi

_KAKASI = kakasi()
_KANA_RE = re.compile(r"[\u3040-\u30ff\uff66-\uff9fー]+")


def _clean(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def romanize_japanese(value: str) -> str:
    text = _clean(value)
    if not text:
        return ""
    converted = _KAKASI.convert(text)
    return "".join(str(item.get("hepburn") or item.get("orig") or "") for item in converted).strip()


def transcribe_japanese_to_hangul(value: str) -> str:
    text = _clean(value)
    if not text:
        return ""
    try:
        return _clean(transcribe(text, "ja"))
    except Exception:
        return ""


def korean_hanja_kana_alias(value: str) -> str:
    """Use Korean Hanja readings for Han characters and Korean phonetics for kana."""
    text = _clean(value)
    if not text:
        return ""
    converted = hanja.translate(text, "substitution")

    def replace_kana(match: re.Match[str]) -> str:
        return transcribe_japanese_to_hangul(match.group(0)) or match.group(0)

    return _clean(_KANA_RE.sub(replace_kana, converted))


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean(value)
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _pack_text(pack: dict[str, str], key: str, fallback: str = "") -> str:
    value = pack.get(key)
    return _clean(value if isinstance(value, str) else fallback)


def build_music_search_index(
    music: list[dict[str, Any]],
    locale_packs: dict[str, dict[str, str]],
) -> dict[str, Any]:
    ko = locale_packs.get("ko", {})
    en = locale_packs.get("en", {})
    ja = locale_packs.get("ja", {})
    items: dict[str, dict[str, Any]] = {}

    for song in music:
        music_id = _clean(song.get("id"))
        if not music_id:
            continue

        title_key = f"la-music_title-{music_id}"
        title_ruby_key = f"la-music_title_ruby-{music_id}"
        singer_key = f"la-singer_name-{music_id}"
        singer_ruby_key = f"la-singer_name_ruby-{music_id}"

        fallback_title = _clean(song.get("title")) or music_id
        fallback_singer = _clean(song.get("singer_name"))
        title_ko = _pack_text(ko, title_key, fallback_title)
        title_en = _pack_text(en, title_key, fallback_title)
        title_ja = _pack_text(ja, title_key, fallback_title)
        title_ruby_ja = _pack_text(ja, title_ruby_key)
        title_ruby_en = _pack_text(en, title_ruby_key)
        singer_ko = _pack_text(ko, singer_key, fallback_singer)
        singer_en = _pack_text(en, singer_key, fallback_singer)
        singer_ja = _pack_text(ja, singer_key, fallback_singer)
        singer_ruby_ja = _pack_text(ja, singer_ruby_key)
        singer_ruby_en = _pack_text(en, singer_ruby_key)

        title_reading_source = title_ruby_ja or title_ja
        singer_reading_source = singer_ruby_ja or singer_ja
        romanized_title = title_ruby_en or romanize_japanese(title_reading_source) or title_en
        romanized_singer = singer_ruby_en or romanize_japanese(singer_reading_source) or singer_en
        phonetic_ko = transcribe_japanese_to_hangul(title_reading_source)
        hanja_kana_ko = korean_hanja_kana_alias(title_ja)
        singer_phonetic_ko = transcribe_japanese_to_hangul(singer_reading_source)

        aliases = _dedupe([
            music_id,
            fallback_title,
            fallback_singer,
            title_ko,
            title_en,
            title_ja,
            title_ruby_ja,
            title_ruby_en,
            romanized_title,
            phonetic_ko,
            hanja_kana_ko,
            singer_ko,
            singer_en,
            singer_ja,
            singer_ruby_ja,
            singer_ruby_en,
            romanized_singer,
            singer_phonetic_ko,
        ])

        items[music_id] = {
            "sort_key": romanized_title or title_en or title_ja or music_id,
            "aliases": aliases,
            "phonetic_ko": phonetic_ko or None,
            "hanja_kana_ko": hanja_kana_ko or None,
        }

    return {
        "version": 1,
        "music_count": len(items),
        "items": items,
    }
