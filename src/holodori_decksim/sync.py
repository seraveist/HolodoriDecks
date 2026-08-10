from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from .sources import COMMIT_API, MASTER_FILES, RAW_ROOT, UPSTREAM_REF, UPSTREAM_REPO

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM_DIR = ROOT / "data" / "upstream"
GENERATED_DIR = ROOT / "data" / "generated"
UPSTREAM_META_FILE = ROOT / "data" / "upstream.json"
STATE_FILE = ROOT / "data" / "sync_state.json"
GENERATED_FILES = ("cards.json", "characters.json", "master_refs.json", "manifest.json")


def _request_text(url: str) -> str:
    token = os.getenv("GITHUB_TOKEN", "")
    headers = {
        "User-Agent": "Holodori-DeckSim/0.1",
        "Accept": "application/vnd.github+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed trusted sources
        return response.read().decode("utf-8")


def _resolve_upstream_commit() -> str:
    payload = json.loads(_request_text(COMMIT_API))
    commit = str(payload.get("sha", "")).lower()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Unable to resolve a valid HolodoriDB upstream commit SHA")
    return commit


def _download_text(filename: str, commit: str) -> str:
    return _request_text(f"{RAW_ROOT}/{commit}/{filename}")


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _load_upstream_meta() -> dict[str, Any]:
    if not UPSTREAM_META_FILE.exists():
        return {}
    return json.loads(UPSTREAM_META_FILE.read_text(encoding="utf-8"))


def _changed_files(
    current_hashes: dict[str, str],
    previous_meta: dict[str, Any],
) -> list[str]:
    previous_hashes = previous_meta.get("fileHashes", {})
    return [
        filename
        for filename in MASTER_FILES
        if filename != "version.txt"
        and previous_hashes.get(filename) != current_hashes.get(filename)
    ]


def _generated_files_present() -> bool:
    return all((GENERATED_DIR / filename).exists() for filename in GENERATED_FILES)


def _load_json(filename: str) -> list[dict[str, Any]]:
    return json.loads((UPSTREAM_DIR / filename).read_text(encoding="utf-8"))


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


def _text_index(filename: str) -> dict[str, str]:
    return {
        key: value.get("text", "")
        for key, value in _data_index(_load_json(filename)).items()
    }


def _enum_suffix(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(value.rsplit("_", 1)[-1])
    except ValueError:
        return None


def fetch_upstream(force: bool = False) -> dict[str, Any]:
    """Inspect one pinned upstream snapshot and cache it only when references changed."""
    UPSTREAM_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)

    commit = _resolve_upstream_commit()
    contents: dict[str, str] = {}
    hashes: dict[str, str] = {}
    for filename in MASTER_FILES:
        content = _download_text(filename, commit)
        contents[filename] = content
        hashes[filename] = _sha256(content)

    version = contents["version.txt"].strip()
    previous_meta = _load_upstream_meta()
    changed_files = _changed_files(hashes, previous_meta)
    generated_missing = not _generated_files_present()
    should_sync = force or bool(changed_files) or generated_missing

    if not should_sync:
        return {
            "master_version": version,
            "upstream_commit": commit,
            "changed": False,
            "changed_files": [],
            "file_hashes": hashes,
        }

    for filename, content in contents.items():
        (UPSTREAM_DIR / filename).write_text(content, encoding="utf-8")

    return {
        "master_version": version,
        "upstream_commit": commit,
        "changed": True,
        "changed_files": changed_files,
        "file_hashes": hashes,
        "forced": force,
        "generated_missing": generated_missing,
    }


def normalize(master_version: str, upstream_commit: str) -> dict[str, int]:
    cards = _data_index(_load_json("Card.json"))
    characters = _data_index(_load_json("Character.json"))
    card_text = _text_index("LangCard_Kor.json")
    character_text = _text_index("LangCharacter_Kor.json")

    leader_skills = _data_index(_load_json("LiveLeaderSkill.json"))
    leader_text = _text_index("LangGeneratedLiveLeaderSkill_Kor.json")

    active_text = _text_index("LangGeneratedLiveActiveSkillLevel_Kor.json")
    passive_text = _text_index("LangGeneratedLivePassiveSkillLevel_Kor.json")
    special_text = _text_index("LangGeneratedLiveSpecialSkillLevel_Kor.json")

    active_levels = _group_skill_levels(
        _load_json("LiveActiveSkillLevel.json"), "live_active_skill_id", active_text
    )
    passive_levels = _group_skill_levels(
        _load_json("LivePassiveSkillLevel.json"), "live_passive_skill_id", passive_text
    )
    special_levels = _group_skill_levels(
        _load_json("LiveSpecialSkillLevel.json"), "live_special_skill_id", special_text
    )

    card_levels = _group_rows(_load_json("CardLevel.json"), "group_id", "level")
    level_limits = _group_rows(_load_json("CardLevelLimit.json"), "group_id", "limitBreakCount")
    potentials = _group_rows(_load_json("CardPotential.json"), "group_id", "upgradeCount")

    trigger_text = _text_index("LangGeneratedLiveSkillTrigger_Kor.json")
    active_effect_text = _text_index("LangGeneratedLiveActiveSkillEffect_Kor.json")
    passive_effect_text = _text_index("LangGeneratedLivePassiveSkillEffect_Kor.json")
    triggers = _normalize_groups(
        _group_rows(_load_json("LiveSkillTrigger.json"), "group_id", "number"), trigger_text
    )
    active_effects = _normalize_groups(
        _group_rows(_load_json("LiveActiveSkillEffect.json"), "group_id", "number"),
        active_effect_text,
    )
    passive_effects = _normalize_groups(
        _group_rows(_load_json("LivePassiveSkillEffect.json"), "group_id", "number"),
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
                    "repository": UPSTREAM_REPO,
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
    normalized_cards.sort(key=lambda row: (row.get("order") or 999999, row["id"]))

    _write_json("characters.json", character_rows)
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
    _write_json(
        "manifest.json",
        {
            "source_repository": UPSTREAM_REPO,
            "source_commit": upstream_commit,
            "master_version": master_version,
            "character_count": len(character_rows),
            "card_count": len(normalized_cards),
            "leader_card_count": sum(1 for card in normalized_cards if card.get("leader")),
            "raden_card_count": len(raden_cards),
            "raden_leader_card_count": len(raden_leaders),
        },
    )

    return {
        "characters": len(character_rows),
        "cards": len(normalized_cards),
        "leaders": sum(1 for card in normalized_cards if card.get("leader")),
    }


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
        grouped.setdefault(skill_id, []).append(data)
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


def _write_sync_metadata(snapshot: dict[str, Any]) -> None:
    upstream_meta = {
        "repository": UPSTREAM_REPO,
        "ref": UPSTREAM_REF,
        "commit": snapshot["upstream_commit"],
        "master_version": snapshot["master_version"],
        "files": list(MASTER_FILES),
        "fileHashes": snapshot["file_hashes"],
    }
    UPSTREAM_META_FILE.parent.mkdir(parents=True, exist_ok=True)
    UPSTREAM_META_FILE.write_text(
        json.dumps(upstream_meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    STATE_FILE.write_text(
        json.dumps(
            {
                "master_version": snapshot["master_version"],
                "upstream_commit": snapshot["upstream_commit"],
                "changed_files": snapshot.get("changed_files", []),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def sync(force: bool = False) -> dict[str, Any]:
    snapshot = fetch_upstream(force=force)
    if not snapshot["changed"]:
        return {
            "changed": False,
            "master_version": snapshot["master_version"],
            "upstream_commit": snapshot["upstream_commit"],
            "changed_files": [],
        }

    counts = normalize(snapshot["master_version"], snapshot["upstream_commit"])
    _write_sync_metadata(snapshot)
    return {
        "changed": True,
        "master_version": snapshot["master_version"],
        "upstream_commit": snapshot["upstream_commit"],
        "changed_files": snapshot.get("changed_files", []),
        **counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Hololive Dreams master data")
    parser.add_argument(
        "--force",
        action="store_true",
        help="normalize the current pinned upstream snapshot even when file hashes are unchanged",
    )
    args = parser.parse_args()
    result = sync(force=args.force)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
