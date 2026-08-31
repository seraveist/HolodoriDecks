from holodori_decksim.automation_gate import evaluate_card_asset_gate, evaluate_master_gate


def rows(prefix: str, count: int):
    return [{"id": f"{prefix}-{index:03d}"} for index in range(count)]


def chart_index(count: int, *, stale: int = 0):
    return {
        "chart_count": count,
        "stale_metadata_count": stale,
        "charts": {f"m{index:04d}:EXPERT": {} for index in range(count)},
    }


def runtime_index(count: int, *, rejected: int = 0):
    return {"runtimeExactCount": count, "rejectedAvailableCount": rejected}


def test_master_gate_accepts_normal_additive_update():
    result = evaluate_master_gate(
        previous_cards=rows("card", 174),
        current_cards=rows("card", 178),
        previous_characters=rows("chr", 62),
        current_characters=rows("chr", 62),
        previous_music=rows("music", 188),
        current_music=rows("music", 194),
        previous_chart_index=chart_index(752),
        current_chart_index=chart_index(776),
        previous_runtime_index=runtime_index(699),
        current_runtime_index=runtime_index(699, rejected=4),
    )
    assert result.safe is True
    assert result.reasons == ()


def test_master_gate_blocks_removal_and_large_growth():
    previous_cards = rows("card", 100)
    current_cards = previous_cards[1:] + rows("new-card", 30)
    result = evaluate_master_gate(
        previous_cards=previous_cards,
        current_cards=current_cards,
        previous_characters=rows("chr", 60),
        current_characters=rows("chr", 60),
        previous_music=rows("music", 100),
        current_music=rows("music", 100),
        previous_chart_index=chart_index(400),
        current_chart_index=chart_index(400),
        previous_runtime_index=runtime_index(350),
        current_runtime_index=runtime_index(350),
    )
    assert result.safe is False
    assert any("removed" in reason for reason in result.reasons)
    assert any("growth" in reason for reason in result.reasons)


def test_master_gate_blocks_runtime_regression():
    result = evaluate_master_gate(
        previous_cards=rows("card", 100),
        current_cards=rows("card", 100),
        previous_characters=rows("chr", 60),
        current_characters=rows("chr", 60),
        previous_music=rows("music", 100),
        current_music=rows("music", 100),
        previous_chart_index=chart_index(400),
        current_chart_index=chart_index(400),
        previous_runtime_index=runtime_index(350),
        current_runtime_index=runtime_index(300),
    )
    assert result.safe is False
    assert any("Runtime Exact coverage" in reason for reason in result.reasons)


def test_card_gate_accepts_small_complete_batch():
    report = {
        "imported_count": 4,
        "public_repair_count": 0,
        "unresolved_count": 0,
        "after": {"missing_count": 0},
    }
    diff = [
        "A\tassets/cards/card-1.webp",
        "A\tassets/cards/card-2.webp",
        "A\tassets/cards/card-3.webp",
        "A\tassets/cards/card-4.webp",
        "M\tassets/card-portrait-sync.json",
    ]
    result = evaluate_card_asset_gate(report=report, diff_lines=diff)
    assert result.safe is True


def test_card_gate_blocks_unresolved_or_deleted_assets():
    report = {
        "imported_count": 1,
        "public_repair_count": 0,
        "unresolved_count": 1,
        "after": {"missing_count": 1},
    }
    diff = ["D\tassets/cards/card-old.webp", "M\tassets/card-portrait-sync.json"]
    result = evaluate_card_asset_gate(report=report, diff_lines=diff)
    assert result.safe is False
    assert any("unresolved" in reason for reason in result.reasons)
    assert any("delete" in reason for reason in result.reasons)
