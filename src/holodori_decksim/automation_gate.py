from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class GateResult:
    safe: bool
    reasons: tuple[str, ...]
    metrics: dict[str, int]

    def to_dict(self) -> dict[str, object]:
        return {
            "safe": self.safe,
            "reasons": list(self.reasons),
            "metrics": self.metrics,
        }


def _ids(rows: Iterable[dict[str, object]], label: str) -> set[str]:
    values = [str(row.get("id", "")).strip() for row in rows]
    if any(not value for value in values):
        raise ValueError(f"{label} contains an empty id")
    if len(values) != len(set(values)):
        raise ValueError(f"{label} contains duplicate ids")
    return set(values)


def _growth_limit(previous: int, minimum: int, ratio: float = 0.20) -> int:
    return max(minimum, math.ceil(previous * ratio))


def evaluate_master_gate(
    *,
    previous_cards: list[dict[str, object]],
    current_cards: list[dict[str, object]],
    previous_characters: list[dict[str, object]],
    current_characters: list[dict[str, object]],
    previous_music: list[dict[str, object]],
    current_music: list[dict[str, object]],
    previous_chart_index: dict[str, object],
    current_chart_index: dict[str, object],
    previous_runtime_index: dict[str, object],
    current_runtime_index: dict[str, object],
) -> GateResult:
    reasons: list[str] = []

    collections = (
        ("card", _ids(previous_cards, "previous cards"), _ids(current_cards, "current cards"), 24),
        (
            "character",
            _ids(previous_characters, "previous characters"),
            _ids(current_characters, "current characters"),
            12,
        ),
        ("music", _ids(previous_music, "previous music"), _ids(current_music, "current music"), 32),
    )

    metrics: dict[str, int] = {}
    for label, previous, current, minimum_growth in collections:
        removed = sorted(previous - current)
        added = current - previous
        metrics[f"{label}_previous"] = len(previous)
        metrics[f"{label}_current"] = len(current)
        metrics[f"{label}_added"] = len(added)
        metrics[f"{label}_removed"] = len(removed)
        if removed:
            preview = ", ".join(removed[:5])
            suffix = "…" if len(removed) > 5 else ""
            reasons.append(f"existing {label} ids were removed: {preview}{suffix}")
        allowed_growth = _growth_limit(len(previous), minimum_growth)
        if len(added) > allowed_growth:
            reasons.append(
                f"{label} growth is unusually large: +{len(added)} (automatic limit +{allowed_growth})"
            )

    previous_charts = set((previous_chart_index.get("charts") or {}).keys())
    current_charts = set((current_chart_index.get("charts") or {}).keys())
    removed_charts = sorted(previous_charts - current_charts)
    added_charts = current_charts - previous_charts
    metrics["chart_previous"] = len(previous_charts)
    metrics["chart_current"] = len(current_charts)
    metrics["chart_added"] = len(added_charts)
    metrics["chart_removed"] = len(removed_charts)
    if removed_charts:
        preview = ", ".join(removed_charts[:5])
        suffix = "…" if len(removed_charts) > 5 else ""
        reasons.append(f"existing chart ids were removed: {preview}{suffix}")
    allowed_chart_growth = _growth_limit(len(previous_charts), 128)
    if len(added_charts) > allowed_chart_growth:
        reasons.append(
            f"chart growth is unusually large: +{len(added_charts)} (automatic limit +{allowed_chart_growth})"
        )

    stale = int(current_chart_index.get("stale_metadata_count", 0) or 0)
    metrics["stale_metadata_count"] = stale
    if stale:
        reasons.append(f"stale Local Exact metadata detected: {stale}")

    previous_runtime = int(previous_runtime_index.get("runtimeExactCount", 0) or 0)
    current_runtime = int(current_runtime_index.get("runtimeExactCount", 0) or 0)
    runtime_drop = max(previous_runtime - current_runtime, 0)
    allowed_runtime_drop = max(8, math.ceil(previous_runtime * 0.05))
    metrics["runtime_exact_previous"] = previous_runtime
    metrics["runtime_exact_current"] = current_runtime
    metrics["runtime_exact_drop"] = runtime_drop
    if runtime_drop > allowed_runtime_drop:
        reasons.append(
            f"Runtime Exact coverage dropped by {runtime_drop} (automatic limit {allowed_runtime_drop})"
        )

    previous_rejected = int(previous_runtime_index.get("rejectedAvailableCount", 0) or 0)
    current_rejected = int(current_runtime_index.get("rejectedAvailableCount", 0) or 0)
    metrics["runtime_rejected_previous"] = previous_rejected
    metrics["runtime_rejected_current"] = current_rejected
    if current_rejected > max(12, previous_rejected + 8):
        reasons.append(
            f"Runtime Exact rejected-chart count increased unusually: {previous_rejected} -> {current_rejected}"
        )

    return GateResult(safe=not reasons, reasons=tuple(reasons), metrics=metrics)


def evaluate_card_asset_gate(
    *,
    report: dict[str, object],
    diff_lines: Iterable[str],
) -> GateResult:
    reasons: list[str] = []
    imported_count = int(report.get("imported_count", 0) or 0)
    repair_count = int(report.get("public_repair_count", 0) or 0)
    unresolved_count = int(report.get("unresolved_count", 0) or 0)
    after = report.get("after") or {}
    missing_after = int(after.get("missing_count", 0) or 0) if isinstance(after, dict) else 0

    portrait_changes = 0
    unexpected_changes = 0
    deleted_files = 0
    for raw in diff_lines:
        line = raw.strip()
        if not line:
            continue
        parts = line.split("\t")
        status = parts[0]
        paths = parts[1:]
        if status.startswith("D"):
            deleted_files += 1
        for path in paths:
            if path == "assets/card-portrait-sync.json":
                continue
            if path.startswith("assets/cards/") and path.endswith(".webp"):
                portrait_changes += 1
            else:
                unexpected_changes += 1

    metrics = {
        "imported_count": imported_count,
        "repair_count": repair_count,
        "unresolved_count": unresolved_count,
        "missing_after": missing_after,
        "portrait_changes": portrait_changes,
        "unexpected_changes": unexpected_changes,
        "deleted_files": deleted_files,
    }

    if unresolved_count:
        reasons.append(f"unresolved portraits remain: {unresolved_count}")
    if missing_after:
        reasons.append(f"selectable-card portraits are still missing: {missing_after}")
    if imported_count > 24:
        reasons.append(f"portrait batch is unusually large: {imported_count} (automatic limit 24)")
    if repair_count > 12:
        reasons.append(f"portrait repair batch is unusually large: {repair_count} (automatic limit 12)")
    if deleted_files:
        reasons.append(f"asset sync attempted to delete {deleted_files} tracked file(s)")
    if unexpected_changes:
        reasons.append(f"asset sync touched {unexpected_changes} unexpected path(s)")
    if portrait_changes > 24:
        reasons.append(f"too many tracked portrait files changed: {portrait_changes} (automatic limit 24)")
    if portrait_changes and portrait_changes != imported_count:
        reasons.append(
            f"reported portrait count does not match changed tracked WebP files: report={imported_count}, changed={portrait_changes}"
        )

    return GateResult(safe=not reasons, reasons=tuple(reasons), metrics=metrics)


def read_diff_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()
