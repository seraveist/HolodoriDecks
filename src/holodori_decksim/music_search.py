from __future__ import annotations

import re
import unicodedata
from typing import Any

import hanja
from pykakasi import kakasi

_KAKASI = kakasi()
_KANA_RE = re.compile(r"[\u3040-\u30ff\uff66-\uff9fー]+")

# Search aliases only need a stable, readable Korean approximation. Keeping this
# mapping local avoids coupling Master/Card sync to a general-purpose G2P package.
_KANA_DIGRAPHS = {
    "きゃ": "캬", "きゅ": "큐", "きょ": "쿄",
    "ぎゃ": "갸", "ぎゅ": "규", "ぎょ": "교",
    "しゃ": "샤", "しゅ": "슈", "しょ": "쇼", "しぇ": "셰",
    "じゃ": "자", "じゅ": "주", "じょ": "조", "じぇ": "제",
    "ちゃ": "차", "ちゅ": "추", "ちょ": "초", "ちぇ": "체",
    "にゃ": "냐", "にゅ": "뉴", "にょ": "뇨",
    "ひゃ": "햐", "ひゅ": "휴", "ひょ": "효",
    "びゃ": "뱌", "びゅ": "뷰", "びょ": "뵤",
    "ぴゃ": "퍄", "ぴゅ": "퓨", "ぴょ": "표",
    "みゃ": "먀", "みゅ": "뮤", "みょ": "묘",
    "りゃ": "랴", "りゅ": "류", "りょ": "료",
    "ふぁ": "파", "ふぃ": "피", "ふぇ": "페", "ふぉ": "포",
    "ゔぁ": "바", "ゔぃ": "비", "ゔぇ": "베", "ゔぉ": "보", "ゔゅ": "뷰",
    "てぃ": "티", "でぃ": "디", "とぅ": "투", "どぅ": "두",
    "うぃ": "위", "うぇ": "웨", "うぉ": "워",
    "つぁ": "차", "つぃ": "치", "つぇ": "체", "つぉ": "초",
}

_KANA_MONOGRAPHS = {
    "あ": "아", "い": "이", "う": "우", "え": "에", "お": "오",
    "か": "가", "き": "기", "く": "구", "け": "게", "こ": "고",
    "が": "가", "ぎ": "기", "ぐ": "구", "げ": "게", "ご": "고",
    "さ": "사", "し": "시", "す": "스", "せ": "세", "そ": "소",
    "ざ": "자", "じ": "지", "ず": "즈", "ぜ": "제", "ぞ": "조",
    "た": "다", "ち": "치", "つ": "쓰", "て": "데", "と": "도",
    "だ": "다", "ぢ": "지", "づ": "즈", "で": "데", "ど": "도",
    "な": "나", "に": "니", "ぬ": "누", "ね": "네", "の": "노",
    "は": "하", "ひ": "히", "ふ": "후", "へ": "헤", "ほ": "호",
    "ば": "바", "び": "비", "ぶ": "부", "べ": "베", "ぼ": "보",
    "ぱ": "파", "ぴ": "피", "ぷ": "푸", "ぺ": "페", "ぽ": "포",
    "ま": "마", "み": "미", "む": "무", "め": "메", "も": "모",
    "や": "야", "ゆ": "유", "よ": "요",
    "ら": "라", "り": "리", "る": "루", "れ": "레", "ろ": "로",
    "わ": "와", "ゐ": "이", "ゑ": "에", "を": "오", "ん": "ㄴ",
    "ぁ": "아", "ぃ": "이", "ぅ": "우", "ぇ": "에", "ぉ": "오",
    "ゃ": "야", "ゅ": "유", "ょ": "요", "ゎ": "와",
    "っ": "", "ー": "", "ゔ": "부",
}


def _clean(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def _katakana_to_hiragana(value: str) -> str:
    result: list[str] = []
    for character in value:
        code = ord(character)
        if 0x30A1 <= code <= 0x30F6:
            result.append(chr(code - 0x60))
        else:
            result.append(character)
    return "".join(result)


def _japanese_reading(value: str) -> str:
    converted = _KAKASI.convert(value)
    reading = "".join(
        str(item.get("hira") or item.get("kana") or item.get("orig") or "")
        for item in converted
    )
    return _katakana_to_hiragana(_clean(reading))


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

    reading = _japanese_reading(text)
    result: list[str] = []
    index = 0
    while index < len(reading):
        pair = reading[index:index + 2]
        if pair in _KANA_DIGRAPHS:
            result.append(_KANA_DIGRAPHS[pair])
            index += 2
            continue

        character = reading[index]
        mapped = _KANA_MONOGRAPHS.get(character)
        result.append(mapped if mapped is not None else character)
        index += 1

    return _clean("".join(result))


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
