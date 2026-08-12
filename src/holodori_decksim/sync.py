from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .sources import (
    CORE_REPO,
    GITHUB_API_ROOT,
    LOCALES,
    MASTER_FILES,
    RAW_GITHUB_ROOT,
    UPSTREAM_REF,
)

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "data" / "generated"
UPSTREAM_META_FILE = ROOT / "data" / "upstream.json"
STATE_FILE = ROOT / "data" / "sync_state.json"
GENERATED_FILES = (
    "cards.json",
    "characters.json",
    "music.json",
    "master_refs.json",
    "manifest.json",
)


def _request_text(url: str, *, accept: str = "application/vnd.github+json") -> str:
    token = os.getenv("GITHUB_TOKEN", "")
    headers = {
        "User-Agent": "HolodoriDeckSim-sync/0.2",
        "Accept": accept,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=60) as response:  # noqa: S310 - trusted fixed hosts
        return response.read().decode("utf-8")


def _request_json(url: str) -> Any:
    return json.loads(_request_text(url))


def _raw_url(repository: str, commit: str, filename: str) -> str:
    return f"{RAW_GITHUB_ROOT}/{repository}/{commit}/{filename}"


def _download_text(repository: str, commit: str, filename: str) -> str:
    return _request_text(_raw_url(repository, commit, filename), accept="text/plain,*/*")


def _resolve_head_commit(repository: str, ref: str = UPSTREAM_REF) -> str:
    payload = _request_json(f"{GITHUB_API_ROOT}/repos/{repository}/commits/{ref}")
    commit = str(payload.get("sha", "")).lower()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError(f"Unable to resolve a valid commit for {repository}@{ref}")
    return commit


def _resolve_commit_for_version(repository: str, master_version: str) -> str:
    """Resolve the newest locale commit whose version.txt matches master_version."""
    head = _resolve_head_commit(repository)
    if _download_text(repository, head, "version.txt").strip() == master_version:
        return head

    # Locale mirrors can lag briefly. Walk commits that touched version.txt instead
    # of pairing translations by timestamp or assuming identical commit SHAs.
    for page in range(1, 6):
        query = urlencode({"path": "version.txt", "per_page": 100, "page": page})
        rows = _request_json(f"{GITHUB_API_ROOT}/repos/{repository}/commits?{query}")
        if not rows:
            break
        for row in rows:
            commit = str(row.get("sha", "")).lower()
            if not re.fullmatch(r"[0-9a-f]{40}", commit):
                continue
            try:
                version = _download_text(repository, commit, "version.txt").strip()
            except Exception:
                continue
            if version == master_version:
                return commit
    raise ValueError(
        f"No {repository} commit with version.txt={master_version} was found in recent history"
    )


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _read_json_file(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def _generated_files_present() -> bool:
    return all((GENERATED_DIR / filename).exists() for filename in GENERATED_FILES)


def _resolve_snapshot(force: bool = False) -> dict[str, Any]:
    core_commit = _resolve_head_commit(CORE_REPO)
    master_version = _download_text(CORE_REPO, core_commit, "version.txt").strip()
    if not re.fullmatch(r"[0-9a-f]{64}", master_version):
        raise ValueError(f"Unexpected master version: {master_version!r}")

    locale_snapshot: dict[str, dict[str, str]] = {}
    for locale, config in LOCALES.items():
        repository = config["repository"]
        commit = core_commit if repository == CORE_REPO else _resolve_commit_for_version(
            repository, master_version
        )
        version = _download_text(repository, commit, "version.txt").strip()
        if version != master_version:
            raise ValueError(
                f"Locale version mismatch for {locale}: {version} != {master_version}"
            )
        locale_snapshot[locale] = {
            "repository": repository,
            "commit": commit,
            "suffix": config["suffix"],
        }

    contents: dict[str, str] = {}
    file_hashes: dict[str, str] = {}
    for filename in MASTER_FILES:
        content = _download_text(CORE_REPO, core_commit, filename)
        contents[filename] = content
        file_hashes[filename] = _sha256(content)

    previous_manifest = _read_json_file(GENERATED_DIR / "manifest.json", {}) or {}
    previous_upstream = _read_json_file(UPSTREAM_META_FILE, {}) or {}
    changed_refs: list[str] = []

    if previous_manifest.get("master_version") != master_version:
        changed_refs.append("master_version")
    previous_hashes = previous_upstream.get("fileHashes", {})
    if any(previous_hashes.get(name) != digest for name, digest in file_hashes.items()):
        changed_refs.append("core_master_files")

    previous_locales = previous_manifest.get("locales", {})
    for locale, config in locale_snapshot.items():
        previous = previous_locales.get(locale, {})
        if previous.get("commit") != config["commit"]:
            changed_refs.append(f"locale:{locale}")

    if not _generated_files_present():
        changed_refs.append("generated_files_missing")
    if force:
        changed_refs.append("forced")

    return {
        "master_version": master_version,
        "upstream_commit": core_commit,
        "locales": locale_snapshot,
        "contents": contents,
        "file_hashes": file_hashes,
        "changed": bool(changed_refs),
        "changed_refs": changed_refs,
    }


def _load_json(snapshot: dict[str, Any], filename: str) -> list[dict[str, Any]]:
    return json.loads(snapshot["contents"][filename])


def _data_index(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row["id"]: row.get("data", {}) for row in rows if row.get("id")}


def _group_rows(
    rows: list[dict[str, Any]],
    group_key: str,
    sort_key: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    camel_key = _camel_case(group_key)
    for row in rows:
        data = row.get("data", {})
        group_id = row.get(group_key) or data.get(camel_key)
        if not group_id:
            continue
        grouped.setdefault(str(group_id), []).append(data)
    if sort_key:
        for values in grouped.values():
            values.sort(key=lambda item: item.get(sort_key, 0))
    return grouped


def _text_index(snapshot: dict[str, Any], filename: str) -> dict[str, str]:
    return {
        key: value.get("text", "")
        for key, value in _data_index(_load_json(snapshot, filename)).items()
    }


def _enum_suffix(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value.rsplit("_", 1)[-1])
    except ValueError:
        return None


def _group_skill_levels(
    rows: list[dict[str, Any]],
    id_key: str,
    descriptions: dict[str, str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    descriptions = descriptions or {}
    for row in rows:
        data = dict(row.get("data", {}))
        skill_id = row.get(id_key) or data.get(_camel_case(id_key))
        if not skill_id:
            continue
        description_id = data.get("descriptionLangId")
        if description_id:
            data["description"] = descriptions.get(description_id, "")
        grouped.setdefault(str(skill_id), []).append(data)
    for levels in grouped.values():
        levels.sort(key=lambda item: item.get("level", 0))
    return grouped


def _normalize_groups(
    grouped: dict[str, list[dict[str, Any]]],
    descriptions: dict[str, str],
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for group_id, values in grouped.items():
        normalized = []
        for value in values:
            item = dict(value)
            description_id = item.get("descriptionLangId")
            if description_id:
                item["description"] = descriptions.get(description_id, "")
            normalized.append(item)
        result[group_id] = normalized
    return result


def _camel_case(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


def _normalize_leader(
    leader_id: str,
    leader: dict[str, Any] | None,
    leader_text: dict[str, str],
    triggers: dict[str, list[dict[str, Any]]],
    passive_effects: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    if not leader:
        return None
    trigger_id = leader.get("liveSkillTriggerGroupId")
    effect_id = leader.get("livePassiveSkillEffectGroupId")
    additional_trigger_id = leader.get("additionalLiveSkillTriggerGroupId")
    additional_effect_id = leader.get("additionalLivePassiveSkillEffectGroupId")
    return {
        "id": leader_id,
        "trigger_id": trigger_id,
        "trigger": triggers.get(trigger_id, []) if trigger_id else [],
        "effect_group_id": effect_id,
        "effect": passive_effects.get(effect_id, []) if effect_id else [],
        "additional_trigger_id": additional_trigger_id,
        "additional_trigger": triggers.get(additional_trigger_id, []) if additional_trigger_id else [],
        "additional_effect_group_id": additional_effect_id,
        "additional_effect": passive_effects.get(additional_effect_id, []) if additional_effect_id else [],
        "description": leader_text.get(leader.get("descriptionLangId", ""), ""),
    }


def _write_json(filename: str, payload: Any) -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    (GENERATED_DIR / filename).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def normalize(snapshot: dict[str, Any]) -> dict[str, int]:
    master_version = snapshot["master_version"]
    upstream_commit = snapshot["upstream_commit"]
    cards = _data_index(_load_json(snapshot, "Card.json"))
    characters = _data_index(_load_json(snapshot, "Character.json"))
    musics = _data_index(_load_json(snapshot, "Music.json"))
    card_text = _text_index(snapshot, "LangCard_Kor.json")
    character_text = _text_index(snapshot, "LangCharacter_Kor.json")
    music_text = _text_index(snapshot, "LangMusic_Kor.json")

    leader_skills = _data_index(_load_json(snapshot, "LiveLeaderSkill.json"))
    leader_text = _text_index(snapshot, "LangGeneratedLiveLeaderSkill_Kor.json")
    active_text = _text_index(snapshot, "LangGeneratedLiveActiveSkillLevel_Kor.json")
    passive_text = _text_index(snapshot, "LangGeneratedLivePassiveSkillLevel_Kor.json")
    special_text = _text_index(snapshot, "LangGeneratedLiveSpecialSkillLevel_Kor.json")

    active_levels = _group_skill_levels(
        _load_json(snapshot, "LiveActiveSkillLevel.json"), "live_active_skill_id", active_text
    )
    passive_levels = _group_skill_levels(
        _load_json(snapshot, "LivePassiveSkillLevel.json"), "live_passive_skill_id", passive_text
    )
    special_levels = _group_skill_levels(
        _load_json(snapshot, "LiveSpecialSkillLevel.json"), "live_special_skill_id", special_text
    )

    card_levels = _group_rows(_load_json(snapshot, "CardLevel.json"), "group_id", "level")
    level_limits = _group_rows(
        _load_json(snapshot, "CardLevelLimit.json"), "group_id", "limitBreakCount"
    )
    potentials = _group_rows(
        _load_json(snapshot, "CardPotential.json"), "group_id", "upgradeCount"
    )

    trigger_text = _text_index(snapshot, "LangGeneratedLiveSkillTrigger_Kor.json")
    active_effect_text = _text_index(snapshot, "LangGeneratedLiveActiveSkillEffect_Kor.json")
    passive_effect_text = _text_index(snapshot, "LangGeneratedLivePassiveSkillEffect_Kor.json")
    triggers = _normalize_groups(
        _group_rows(_load_json(snapshot, "LiveSkillTrigger.json"), "group_id", "number"),
        trigger_text,
    )
    active_effects = _normalize_groups(
        _group_rows(_load_json(snapshot, "LiveActiveSkillEffect.json"), "group_id", "number"),
        active_effect_text,
    )
    passive_effects = _normalize_groups(
        _group_rows(_load_json(snapshot, "LivePassiveSkillEffect.json"), "group_id", "number"),
        passive_effect_text,
    )

    character_rows: list[dict[str, Any]] = []
    for character_id, data in characters.items():
        if data.get("isPlayable") is False:
            continue
        character_rows.append(
            {
                "id": character_id,
                "name": character_text.get(data.get("nameLangId", ""), data.get("nameEng", "")),
                "short_name": character_text.get(
                    data.get("shortNameLangId", ""), data.get("shortNameEng", "")
                ),
                "name_en": data.get("nameEng"),
                "production_id": data.get("characterProductionId"),
                "grouping_ids": data.get("regularCharacterGroupingIds", []),
                "asset_id": data.get("assetId"),
                "order": data.get("order"),
            }
        )

    music_rows: list[dict[str, Any]] = []
    for music_id, data in musics.items():
        title_lang_id = data.get("titleLangId", "")
        singer_lang_id = data.get("characterGroupDisplayNameLangId", "")
        music_rows.append(
            {
                "id": music_id,
                "title": music_text.get(title_lang_id, title_lang_id or music_id),
                "singer_name": music_text.get(singer_lang_id, ""),
                "character_ids": data.get("characterIds", []),
                "jacket_asset_id": data.get("jacketAssetId"),
                "asset_id": data.get("assetId"),
                "playing_seconds": data.get("playingSeconds"),
                "category_type": data.get("categoryType"),
                "release_type": data.get("releaseType"),
                "live_score_coefficient_permil": data.get("liveScoreCoefficientPermil"),
                "single_live_score_rank_group_id": data.get(
                    "singleLiveScoreEvaluationRankGroupId"
                ),
                "multi_live_score_rank_group_id": data.get(
                    "multiLiveScoreEvaluationRankGroupId"
                ),
                "mv_url": data.get("mvUrl"),
                "order": data.get("order"),
                "_source": {
                    "repository": CORE_REPO,
                    "commit": upstream_commit,
                    "master_version": master_version,
                },
            }
        )

    normalized_cards: list[dict[str, Any]] = []
    missing_characters: list[str] = []
    missing_skill_refs: list[str] = []
    for card_id, data in cards.items():
        character_id = data.get("characterId")
        character = characters.get(character_id)
        if not character:
            missing_characters.append(card_id)
            continue

        skill_refs = {
            "active": (data.get("liveActiveSkillId"), active_levels),
            "passive": (data.get("livePassiveSkillId"), passive_levels),
            "special": (data.get("liveSpecialSkillId"), special_levels),
        }
        for kind, (skill_id, level_map) in skill_refs.items():
            if skill_id and skill_id not in level_map:
                missing_skill_refs.append(f"{card_id}:{kind}:{skill_id}")

        leader_id = card_id.replace("card-", "live_leader_skill-card-", 1)
        leader = leader_skills.get(leader_id)
        level_group_id = data.get("cardLevelGroupId")
        level_limit_group_id = data.get("cardLevelLimitGroupId")
        potential_group_id = data.get("cardPotentialGroupId")

        normalized_cards.append(
            {
                "id": card_id,
                "character_id": character_id,
                "character_name": character_text.get(
                    character.get("nameLangId", ""), character.get("nameEng", character_id)
                ),
                "name": card_text.get(data.get("nameLangId", ""), data.get("nameLangId")),
                "rarity": _enum_suffix(data.get("rarity")),
                "attribute": _enum_suffix(data.get("attributeType")),
                "parameter_ratio_permil": {
                    "performance": data.get("performancePermilMultiply", 0),
                    "technique": data.get("techniquePermilMultiply", 0),
                    "sense": data.get("sensePermilMultiply", 0),
                },
                "growth": {
                    "level_group_id": level_group_id,
                    "levels": card_levels.get(level_group_id, []),
                    "level_limit_group_id": level_limit_group_id,
                    "level_limits": level_limits.get(level_limit_group_id, []),
                    "potential_group_id": potential_group_id,
                    "potential_effects": potentials.get(potential_group_id, []),
                },
                "asset_id": data.get("assetId"),
                "order": data.get("order"),
                "skills": {
                    "active": {
                        "id": data.get("liveActiveSkillId"),
                        "levels": active_levels.get(data.get("liveActiveSkillId"), []),
                    },
                    "passive": {
                        "id": data.get("livePassiveSkillId"),
                        "levels": passive_levels.get(data.get("livePassiveSkillId"), []),
                    },
                    "special": {
                        "id": data.get("liveSpecialSkillId"),
                        "levels": special_levels.get(data.get("liveSpecialSkillId"), []),
                    },
                },
                "leader": _normalize_leader(
                    leader_id, leader, leader_text, triggers, passive_effects
                ),
                "_source": {
                    "repository": CORE_REPO,
                    "commit": upstream_commit,
                    "master_version": master_version,
                },
            }
        )

    if missing_characters:
        raise ValueError(f"Cards reference missing characters: {missing_characters[:10]}")
    if missing_skill_refs:
        raise ValueError(f"Cards reference missing skill levels: {missing_skill_refs[:10]}")

    character_rows.sort(key=lambda row: (row.get("order") or 999999, row["id"]))
    music_rows.sort(key=lambda row: (row.get("order") or 999999999, row["id"]))
    normalized_cards.sort(key=lambda row: (row.get("order") or 999999, row["id"]))

    _write_json("characters.json", character_rows)
    _write_json("music.json", music_rows)
    _write_json("cards.json", normalized_cards)
    _write_json(
        "master_refs.json",
        {
            "triggers": triggers,
            "active_effects": active_effects,
            "passive_effects": passive_effects,
        },
    )

    raden_cards = [card for card in normalized_cards if card["character_id"] == "chr-06004"]
    raden_leaders = [card for card in raden_cards if card.get("leader")]
    manifest = {
        "source_repository": CORE_REPO,
        "source_commit": upstream_commit,
        "master_version": master_version,
        "character_count": len(character_rows),
        "card_count": len(normalized_cards),
        "music_count": len(music_rows),
        "leader_card_count": sum(1 for card in normalized_cards if card.get("leader")),
        "raden_card_count": len(raden_cards),
        "raden_leader_card_count": len(raden_leaders),
        "locales": snapshot["locales"],
    }
    _write_json("manifest.json", manifest)

    return {
        "characters": len(character_rows),
        "cards": len(normalized_cards),
        "music": len(music_rows),
        "leaders": manifest["leader_card_count"],
    }


def _write_sync_metadata(snapshot: dict[str, Any], counts: dict[str, int]) -> None:
    upstream_meta = {
        "repository": CORE_REPO,
        "ref": UPSTREAM_REF,
        "commit": snapshot["upstream_commit"],
        "master_version": snapshot["master_version"],
        "locales": snapshot["locales"],
        "files": list(MASTER_FILES),
        "fileHashes": snapshot["file_hashes"],
    }
    UPSTREAM_META_FILE.parent.mkdir(parents=True, exist_ok=True)
    UPSTREAM_META_FILE.write_text(
        json.dumps(upstream_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    STATE_FILE.write_text(
        json.dumps(
            {
                "master_version": snapshot["master_version"],
                "upstream_commit": snapshot["upstream_commit"],
                "locales": {
                    locale: config["commit"] for locale, config in snapshot["locales"].items()
                },
                "changed_refs": snapshot.get("changed_refs", []),
                "counts": counts,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def sync(force: bool = False) -> dict[str, Any]:
    snapshot = _resolve_snapshot(force=force)
    if not snapshot["changed"]:
        return {
            "changed": False,
            "master_version": snapshot["master_version"],
            "upstream_commit": snapshot["upstream_commit"],
            "changed_refs": [],
            "locales": {
                locale: config["commit"] for locale, config in snapshot["locales"].items()
            },
        }

    counts = normalize(snapshot)
    _write_sync_metadata(snapshot, counts)
    return {
        "changed": True,
        "master_version": snapshot["master_version"],
        "upstream_commit": snapshot["upstream_commit"],
        "changed_refs": snapshot.get("changed_refs", []),
        "locales": {
            locale: config["commit"] for locale, config in snapshot["locales"].items()
        },
        **counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync hololive Dreams master data")
    parser.add_argument(
        "--force",
        action="store_true",
        help="rebuild the resolved version-aligned snapshot even when references are unchanged",
    )
    args = parser.parse_args()
    result = sync(force=args.force)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
