#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from holodori_decksim.card_assets import (
    ASSET_DIR,
    ASSET_TOOL_COMMIT,
    ASSET_TOOL_REPOSITORY,
    CARDS_FILE,
    DEFAULT_WEBP_QUALITY,
    PROVENANCE_FILE,
    audit_portraits,
    sync_missing_portraits,
)
from holodori_decksim.public_card_art import sync_public_snapshot_portraits


def _write_report(path: Path | None, payload: dict) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _octo_failure_result(before: dict, exc: Exception) -> dict:
    unresolved = [
        {
            "id": item["id"],
            "asset_id": item["asset_id"],
            "reason": f"Octo fallback unavailable: {type(exc).__name__}: {exc}",
        }
        for item in before["missing"]
    ]
    return {
        "asset_tool_repository": ASSET_TOOL_REPOSITORY,
        "asset_tool_commit": ASSET_TOOL_COMMIT,
        "catalog_revision": 0,
        "before": before,
        "imported_count": 0,
        "imported": [],
        "unresolved_count": len(unresolved),
        "unresolved": unresolved,
        "after": before,
        "fallback_error": f"{type(exc).__name__}: {exc}",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit or synchronize missing rarity-4/5 Holodori card portraits"
    )
    parser.add_argument("--sync", action="store_true", help="download/extract missing portraits")
    parser.add_argument("--require-complete", action="store_true", help="fail when any portrait is missing")
    parser.add_argument("--cards", type=Path, default=CARDS_FILE)
    parser.add_argument("--assets-dir", type=Path, default=ASSET_DIR)
    parser.add_argument("--provenance", type=Path, default=PROVENANCE_FILE)
    parser.add_argument("--catalog-cache", type=Path, default=None)
    parser.add_argument("--max-candidates", type=int, default=12)
    parser.add_argument("--quality", type=int, default=DEFAULT_WEBP_QUALITY, choices=range(1, 101), metavar="1-100")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    if args.sync:
        public = sync_public_snapshot_portraits(
            cards_path=args.cards,
            assets_dir=args.assets_dir,
            provenance_path=args.provenance,
        )

        if public["after"]["missing_count"]:
            try:
                octo = sync_missing_portraits(
                    cards_path=args.cards,
                    assets_dir=args.assets_dir,
                    provenance_path=args.provenance,
                    catalog_cache=args.catalog_cache,
                    max_candidates=args.max_candidates,
                    quality=args.quality,
                )
            except Exception as exc:
                octo = _octo_failure_result(public["after"], exc)
        else:
            octo = {
                "asset_tool_repository": ASSET_TOOL_REPOSITORY,
                "asset_tool_commit": ASSET_TOOL_COMMIT,
                "catalog_revision": 0,
                "before": public["after"],
                "imported_count": 0,
                "imported": [],
                "unresolved_count": 0,
                "unresolved": [],
                "after": public["after"],
            }

        imported = [*public["imported"], *octo["imported"]]
        result = {
            "public_source_repository": public["source_repository"],
            "public_source_commit": public["source_commit"],
            "public_imported_count": public["imported_count"],
            "asset_tool_repository": octo["asset_tool_repository"],
            "asset_tool_commit": octo["asset_tool_commit"],
            "octo_imported_count": octo["imported_count"],
            "catalog_revision": octo.get("catalog_revision", 0),
            "before": public["before"],
            "imported_count": len(imported),
            "imported": imported,
            "unresolved_count": octo["unresolved_count"],
            "unresolved": octo["unresolved"],
            "after": octo["after"],
        }
        if octo.get("fallback_error"):
            result["octo_fallback_error"] = octo["fallback_error"]

        _write_report(args.report, result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["unresolved_count"]:
            return 2
        if args.require_complete and result["after"]["missing_count"]:
            return 1
        return 0

    result = audit_portraits(args.cards, args.assets_dir)
    _write_report(args.report, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.require_complete and result["missing_count"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
