#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "data" / "generated"


def load_json(path: Path) -> Any:
    if not path.exists():
        raise AssertionError(f"missing required file: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def unique_ids(rows: list[dict[str, Any]], label: str) -> set[str]:
    ids = [str(row.get("id", "")) for row in rows]
    if any(not item for item in ids):
        raise AssertionError(f"{label}: empty id found")
    if len(ids) != len(set(ids)):
        raise AssertionError(f"{label}: duplicate ids found")
    return set(ids)


def validate_drop(current: int, previous: int, label: str) -> None:
    if previous <= 0 or current >= previous:
        return
    removed = previous - current
    threshold = max(5, int(previous * 0.10))
    if removed > threshold:
        raise AssertionError(
            f"{label} count dropped too much: {previous} -> {current} (-{removed}); "
            f"manual review required"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate generated Holodori DeckSim data")
    parser.add_argument("--baseline", type=Path, help="previous manifest for catastrophic-drop checks")
    args = parser.parse_args()

    manifest = load_json(GENERATED / "manifest.json")
    cards = load_json(GENERATED / "cards.json")
    characters = load_json(GENERATED / "characters.json")
    music = load_json(GENERATED / "music.json")
    master_refs = load_json(GENERATED / "master_refs.json")

    if not isinstance(cards, list) or not isinstance(characters, list) or not isinstance(music, list):
        raise AssertionError("core generated datasets must be arrays")
    if len(cards) < 100 or len(characters) < 50 or len(music) < 100:
        raise AssertionError(
            f"unexpectedly small datasets: cards={len(cards)}, characters={len(characters)}, music={len(music)}"
        )

    card_ids = unique_ids(cards, "cards")
    character_ids = unique_ids(characters, "characters")
    music_ids = unique_ids(music, "music")

    expected_counts = {
        "card_count": len(cards),
        "character_count": len(characters),
        "music_count": len(music),
    }
    for key, expected in expected_counts.items():
        if int(manifest.get(key, -1)) != expected:
            raise AssertionError(f"manifest {key} mismatch: {manifest.get(key)} != {expected}")

    source_commit = str(manifest.get("source_commit", ""))
    master_version = str(manifest.get("master_version", ""))
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise AssertionError("manifest source_commit is not a 40-char SHA")
    if not re.fullmatch(r"[0-9a-f]{64}", master_version):
        raise AssertionError("manifest master_version is not a 64-char revision")

    locales = manifest.get("locales", {})
    if set(locales) != {"ko", "en", "ja"}:
        raise AssertionError(f"unexpected locale set: {sorted(locales)}")
    for locale, config in locales.items():
        if not str(config.get("repository", "")).startswith("HolodoriDB/"):
            raise AssertionError(f"{locale}: invalid locale repository")
        if not re.fullmatch(r"[0-9a-f]{40}", str(config.get("commit", ""))):
            raise AssertionError(f"{locale}: invalid locale commit")
        if not config.get("suffix"):
            raise AssertionError(f"{locale}: missing language suffix")

    missing_character_refs = [
        card["id"] for card in cards if str(card.get("character_id", "")) not in character_ids
    ]
    if missing_character_refs:
        raise AssertionError(f"cards reference missing characters: {missing_character_refs[:10]}")

    missing_skill_levels: list[str] = []
    for card in cards:
        for kind in ("active", "passive", "special"):
            skill = card.get("skills", {}).get(kind, {})
            if skill.get("id") and not skill.get("levels"):
                missing_skill_levels.append(f"{card['id']}:{kind}:{skill['id']}")
    if missing_skill_levels:
        raise AssertionError(f"skills missing levels: {missing_skill_levels[:10]}")

    leaders = [card for card in cards if card.get("leader")]
    if int(manifest.get("leader_card_count", -1)) != len(leaders):
        raise AssertionError("manifest leader_card_count mismatch")
    if len(leaders) < max(1, int(len(cards) * 0.8)):
        raise AssertionError(f"too few leader definitions: {len(leaders)}/{len(cards)}")

    raden = [card for card in cards if card.get("character_id") == "chr-06004"]
    if len(raden) < 3 or not any(card.get("rarity") == 5 and card.get("leader") for card in raden):
        raise AssertionError("Raden leader regression detected")

    for key in ("triggers", "active_effects", "passive_effects"):
        if not isinstance(master_refs.get(key), dict) or not master_refs[key]:
            raise AssertionError(f"master_refs.{key} is missing or empty")

    if args.baseline and args.baseline.exists():
        baseline = load_json(args.baseline)
        validate_drop(len(cards), int(baseline.get("card_count", 0)), "card")
        validate_drop(len(characters), int(baseline.get("character_count", 0)), "character")
        validate_drop(len(music), int(baseline.get("music_count", 0)), "music")

    chart_index = load_json(GENERATED / "chart-index.json")
    score_rules = load_json(GENERATED / "live-score-rules.json")
    if chart_index.get("source_commit") != source_commit:
        raise AssertionError("chart-index source commit does not match core manifest")
    if score_rules.get("source_commit") != source_commit:
        raise AssertionError("live-score-rules source commit does not match core manifest")

    charts = chart_index.get("charts", {})
    if int(chart_index.get("chart_count", -1)) != len(charts):
        raise AssertionError("chart-index chart_count mismatch")
    if len(charts) < len(music_ids) * 3:
        raise AssertionError(f"too few difficulty charts: {len(charts)} for {len(music_ids)} songs")

    exact_count = 0
    for key, chart in charts.items():
        metadata_path = chart.get("metadataPath")
        if not metadata_path:
            continue
        exact_count += 1
        relative = str(metadata_path).removeprefix("./")
        metadata = load_json(GENERATED / relative)
        if metadata.get("musicId") != chart.get("musicId"):
            raise AssertionError(f"{key}: exact metadata music id mismatch")
        if str(metadata.get("difficulty", "")).upper() != str(chart.get("difficulty", "")).upper():
            raise AssertionError(f"{key}: exact metadata difficulty mismatch")
        if metadata.get("chartHash") and chart.get("chartHash") != metadata.get("chartHash"):
            raise AssertionError(f"{key}: stale exact metadata chart hash")
        expected_notes = int(chart.get("fullComboNoteCount") or 0)
        notes = metadata.get("notes", [])
        if expected_notes and len(notes) != expected_notes:
            raise AssertionError(f"{key}: exact metadata note count {len(notes)} != {expected_notes}")
    if int(chart_index.get("exact_metadata_count", -1)) != exact_count:
        raise AssertionError("chart-index exact_metadata_count mismatch")

    manual_weights = score_rules.get("noteWeights", {}).get("manual", {})
    auto_weights = score_rules.get("noteWeights", {}).get("auto", {})
    combo = score_rules.get("combo", [])
    if len(manual_weights) < 5 or len(auto_weights) < 5 or len(combo) < 5:
        raise AssertionError("live score rules are incomplete")

    i18n_manifest = load_json(GENERATED / "i18n" / "manifest.json")
    if i18n_manifest.get("master_version") != master_version:
        raise AssertionError("i18n master version does not match core manifest")
    i18n_locales = i18n_manifest.get("locales", {})
    if set(i18n_locales) != {"ko", "en", "ja"}:
        raise AssertionError("i18n locale set mismatch")
    for locale in ("ko", "en", "ja"):
        pack = load_json(GENERATED / "i18n" / f"{locale}.json")
        if len(pack) < 1000:
            raise AssertionError(f"{locale}: unexpectedly small language pack")
        if i18n_locales[locale].get("commit") != locales[locale].get("commit"):
            raise AssertionError(f"{locale}: i18n commit does not match manifest locale commit")

    selectable = [card for card in cards if int(card.get("rarity") or 0) in {4, 5}]
    missing_images = [
        card["id"] for card in selectable if not (ROOT / "assets" / "cards" / f"{card['id']}.webp").exists()
    ]

    print(
        json.dumps(
            {
                "master_version": master_version,
                "source_commit": source_commit,
                "cards": len(card_ids),
                "characters": len(character_ids),
                "music": len(music_ids),
                "charts": len(charts),
                "exact_charts": exact_count,
                "missing_selectable_card_images": len(missing_images),
                "locales": {locale: locales[locale]["commit"] for locale in locales},
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
