from holodori_decksim.sync import (
    _camel_case,
    _changed_files,
    _data_index,
    _enum_suffix,
    _group_rows,
    _group_skill_levels,
    _normalize_groups,
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
    grouped = _group_skill_levels(rows, "live_active_skill_id", {"desc-1": "one", "desc-2": "two"})
    assert [row["level"] for row in grouped["skill-a"]] == [1, 2]
    assert grouped["skill-a"][0]["description"] == "one"
    assert _camel_case("live_active_skill_id") == "liveActiveSkillId"


def test_normalize_groups_adds_description() -> None:
    grouped = {"effect-a": [{"number": 1, "descriptionLangId": "desc-a", "value": "100"}]}
    normalized = _normalize_groups(grouped, {"desc-a": "effect description"})
    assert normalized["effect-a"][0]["description"] == "effect description"


def test_sha256_is_stable() -> None:
    assert _sha256("holodori") == _sha256("holodori")
    assert _sha256("holodori") != _sha256("Holodori")


def test_changed_files_only_reports_reference_content_changes(monkeypatch) -> None:
    monkeypatch.setattr("holodori_decksim.sync.MASTER_FILES", ("Card.json", "Character.json"))
    current = {"Card.json": "hash-a", "Character.json": "hash-b"}
    previous = {"fileHashes": {"Card.json": "hash-a", "Character.json": "old-hash"}}
    assert _changed_files(current, previous) == ["Character.json"]
