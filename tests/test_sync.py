from holodori_decksim.sources import LOCALES, MASTER_FILES
from holodori_decksim.sync import (
    _camel_case,
    _data_index,
    _enum_suffix,
    _group_rows,
    _group_skill_levels,
    _normalize_groups,
    _normalize_leader,
    _sha256,
)


def test_enum_suffix() -> None:
    assert _enum_suffix("CardRarity_CARD_RARITY_RARITY_5") == 5
    assert _enum_suffix("CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2") == 2
    assert _enum_suffix(None) is None


def test_data_index() -> None:
    rows = [{"id": "a", "data": {"value": 1}}, {"id": "b", "data": {"value": 2}}]
    assert _data_index(rows)["b"]["value"] == 2


def test_group_rows_uses_top_level_keys_and_sorts() -> None:
    rows = [
        {"group_id": "g", "level": 2, "data": {"groupId": "g", "level": 2}},
        {"group_id": "g", "level": 1, "data": {"groupId": "g", "level": 1}},
    ]
    grouped = _group_rows(rows, "group_id", "level")
    assert [row["level"] for row in grouped["g"]] == [1, 2]


def test_skill_levels_are_grouped_sorted_and_described() -> None:
    rows = [
        {
            "live_active_skill_id": "skill-a",
            "level": 2,
            "data": {"level": 2, "descriptionLangId": "desc-2"},
        },
        {
            "live_active_skill_id": "skill-a",
            "level": 1,
            "data": {"level": 1, "descriptionLangId": "desc-1"},
        },
    ]
    grouped = _group_skill_levels(
        rows,
        "live_active_skill_id",
        {"desc-1": "one", "desc-2": "two"},
    )
    assert [row["level"] for row in grouped["skill-a"]] == [1, 2]
    assert grouped["skill-a"][0]["description"] == "one"
    assert _camel_case("live_active_skill_id") == "liveActiveSkillId"


def test_normalize_groups_adds_description() -> None:
    grouped = {"effect-a": [{"number": 1, "descriptionLangId": "desc-a", "value": "100"}]}
    normalized = _normalize_groups(grouped, {"desc-a": "effect description"})
    assert normalized["effect-a"][0]["description"] == "effect description"


def test_normalize_leader_preserves_primary_and_additional_groups() -> None:
    leader = {
        "liveSkillTriggerGroupId": "trigger-a",
        "livePassiveSkillEffectGroupId": "effect-a",
        "additionalLiveSkillTriggerGroupId": "trigger-b",
        "additionalLivePassiveSkillEffectGroupId": "effect-b",
        "descriptionLangId": "leader-desc",
    }
    result = _normalize_leader(
        "leader-a",
        leader,
        {"leader-desc": "leader"},
        {"trigger-a": [{"number": 1}], "trigger-b": [{"number": 2}]},
        {"effect-a": [{"value": 100}], "effect-b": [{"value": 200}]},
    )
    assert result is not None
    assert result["description"] == "leader"
    assert result["trigger"][0]["number"] == 1
    assert result["additional_effect"][0]["value"] == 200


def test_sha256_is_stable() -> None:
    assert _sha256("holodori") == _sha256("holodori")
    assert _sha256("holodori") != _sha256("Holodori")


def test_sync_sources_are_explicit_and_cover_three_locales() -> None:
    assert set(LOCALES) == {"ko", "en", "ja"}
    assert all(config["repository"].startswith("HolodoriDB/") for config in LOCALES.values())
    assert "Card.json" in MASTER_FILES
    assert "LiveSpecialSkillLevel.json" in MASTER_FILES
    assert "LangGeneratedLiveLeaderSkill_Kor.json" in MASTER_FILES
