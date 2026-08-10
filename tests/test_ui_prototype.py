from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_static_ui_entry_files_exist() -> None:
    for name in ("index.html", "styles.css", "app.js"):
        assert (ROOT / name).exists(), name


def test_prototype_contains_four_primary_sections() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for section_id in (
        "target-setting",
        "member-setting",
        "music-setting",
        "result-setting",
    ):
        assert f'id="{section_id}"' in html


def test_card_picker_controls_are_present() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for control_id in (
        "card-search",
        "rarity-filter",
        "attribute-filter",
        "card-sort",
    ):
        assert f'id="{control_id}"' in html


def test_ui_loads_committed_master_data_without_music_images() -> None:
    script = (ROOT / "app.js").read_text(encoding="utf-8")
    assert 'fetch("data/generated/cards.json")' in script
    assert 'fetch("data/generated/music.json")' in script
    assert "assets/music/" not in script
    assert "music-placeholder" not in script


def test_rarity_three_cards_do_not_request_portraits() -> None:
    script = (ROOT / "app.js").read_text(encoding="utf-8")
    assert "![4, 5].includes(Number(card.rarity))" in script
    assert 'return `${iconHtml}<div class="slot-r3">★3</div>`' in script
