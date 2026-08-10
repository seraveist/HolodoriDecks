from holodori_decksim.sync import _camel_case, _data_index, _enum_suffix, _group_skill_levels


def test_enum_suffix() -> None:
    assert _enum_suffix("CardRarity_CARD_RARITY_RARITY_5") == 5
    assert _enum_suffix("CardAttributeType_CARD_ATTRIBUTE_TYPE_ATTRIBUTE_2") == 2
    assert _enum_suffix(None) is None


def test_data_index() -> None:
    rows = [{"id": "a", "data": {"value": 1}}, {"id": "b", "data": {"value": 2}}]
    assert _data_index(rows)["b"]["value"] == 2


def test_skill_levels_are_grouped_and_sorted() -> None:
    rows = [
        {"live_active_skill_id": "skill-a", "level": 2, "data": {"level": 2}},
        {"live_active_skill_id": "skill-a", "level": 1, "data": {"level": 1}},
    ]
    grouped = _group_skill_levels(rows, "live_active_skill_id")
    assert [row["level"] for row in grouped["skill-a"]] == [1, 2]
    assert _camel_case("live_active_skill_id") == "liveActiveSkillId"
