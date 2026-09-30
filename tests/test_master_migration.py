import copy
import hashlib

from google.protobuf.descriptor_pb2 import DescriptorProto, FieldDescriptorProto as F
import pytest

from holodori_decksim import sync
from holodori_decksim import chart_assets as assets
from holodori_decksim.master_source import AndroidMaster, source_path


def test_language_paths_share_one_master_repository():
    assert source_path("Card.json") == "tables/Card.json"
    for suffix, language in [("Kor", "kor"), ("Eng", "eng"), ("Jpn", "jpn")]:
        assert source_path(f"LangCard_{suffix}.json") == f"languages/{language}/LangCard.json"


def adapter():
    master = AndroidMaster.__new__(AndroidMaster)
    row = DescriptorProto(name="Card")
    for name, number, kind, type_name in [("rarity", 1, F.TYPE_ENUM, ".CardRarity"),
                                          ("max_value", 2, F.TYPE_INT64, ""),
                                          ("child", 3, F.TYPE_MESSAGE, ".Child")]:
        row.field.add(name=name, number=number, type=kind, type_name=type_name)
    child = DescriptorProto(name="Child")
    child.field.add(name="target_id", number=1, type=F.TYPE_STRING)
    master.messages = {".Card": row, ".Child": child}
    master.enums = {".CardRarity": ("CardRarity", {5: "CARD_RARITY_RARITY_5"})}
    return master


def test_descriptor_preserves_existing_enum_spelling_and_large_integers():
    result = adapter()._message({"rarity": {"name": "CARD_RARITY_RARITY_5", "number": 5},
                                "max_value": "9007199254740993", "child": {"target_id": "chr-1"}}, ".Card")
    assert result == {"rarity": "CardRarity_CARD_RARITY_RARITY_5", "maxValue": "9007199254740993",
                      "child": {"targetId": "chr-1"}}


def test_unknown_fields_and_inconsistent_enum_values_fail_closed():
    with pytest.raises(ValueError, match="Unknown Android field"):
        adapter()._message({"new_field": 1}, ".Card")
    with pytest.raises(ValueError, match="enum"):
        adapter()._message({"rarity": {"name": "CARD_RARITY_RARITY_5", "number": 4}}, ".Card")


def test_corrupt_encrypted_resource_is_never_accepted():
    raw = b"a small encrypted chart fixture"
    digest = hashlib.md5(raw).digest()
    for representation in [digest.hex(), "".join(format(b, "x") for b in digest)]:
        assets.verify_resource(raw, representation, len(raw))
        with pytest.raises(ValueError, match="MD5"):
            assets.verify_resource(raw + b"changed", representation, len(raw) + 7)
        with pytest.raises(ValueError, match="size"):
            assets.verify_resource(raw, representation, len(raw) + 1)


def example():
    values = {f"{name}_NOTE_COUNT": "0" for name in assets.COUNTS.values()}
    values.update(MUSIC_ID="m0001", FULL_COMBO_NOTE_COUNT="1", NORMAL_NOTE_COUNT="1")
    raw = "\n".join(f"#{name} {value}" for name, value in values.items()).encode()
    meta = {"notes": [["tap", 10.0]], "skills": [
        {"skill_slot_no": slot, "time": float(slot), "skill_starts_at_combo": 0} for slot in range(1, 6)]}
    return raw, values, meta


def test_same_note_count_does_not_replace_identity_and_category_validation():
    raw, values, meta = example()
    assert assets.headers(raw, "m0001", 1) == values
    with pytest.raises(ValueError, match="identity"):
        assets.headers(raw, "m0002", 1)
    assets.validate_timeline(meta, {"fullComboNoteCount": 1}, values)
    meta["notes"][0][0] = "flick"
    with pytest.raises(ValueError, match="count differs"):
        assets.validate_timeline(meta, {"fullComboNoteCount": 1}, values)


@pytest.mark.parametrize("mutation", ["slots", "order", "damage"])
def test_incomplete_or_unsupported_timeline_is_not_exact(mutation):
    _, values, meta = example()
    if mutation == "slots":
        meta["skills"].pop()
    elif mutation == "order":
        meta["skills"][1]["time"] = 0
    else:
        values["DAMAGE_NOTE_COUNT"] = "1"
    with pytest.raises(ValueError):
        assets.validate_timeline(meta, {"fullComboNoteCount": 1}, values)


def test_asset_only_change_triggers_full_sync_when_master_is_unchanged(monkeypatch):
    snapshot = {"changed": False, "upstream_commit": "a" * 40, "master_version": "b" * 64,
                "changed_refs": [], "locales": {"ko": {"commit": "a" * 40}}}
    monkeypatch.setattr(sync, "_resolve_snapshot", lambda **kwargs: copy.deepcopy(snapshot))
    calls = []
    monkeypatch.setattr(assets, "sync_chart_assets", lambda commit: calls.append(commit) or True)
    monkeypatch.setattr(sync, "normalize", lambda snapshot: {"cards": 1})
    monkeypatch.setattr(sync, "_write_sync_metadata", lambda *args: None)
    result = sync.sync()
    assert calls == ["a" * 40]
    assert result["changed"] and result["changed_refs"] == ["chart_assets"]


def test_pinned_rebuild_does_not_query_current_game_assets(monkeypatch):
    snapshot = {"changed": False, "upstream_commit": "a" * 40, "master_version": "b" * 64,
                "locales": {}, "changed_refs": []}
    monkeypatch.setattr(sync, "_resolve_snapshot", lambda **kwargs: snapshot)
    monkeypatch.setattr(sync, "_read_json_file", lambda *args: {"source_commit": "a" * 40, "master_version": "b" * 64})
    monkeypatch.setattr(assets, "sync_chart_assets", lambda _: pytest.fail("live assets read during pinned rebuild"))
    assert not sync.sync(pinned=True)["changed"]
