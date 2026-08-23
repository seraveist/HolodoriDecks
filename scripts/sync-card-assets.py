#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from holodori_decksim.card_assets import (
    ASSET_DIR,
    CARDS_FILE,
    DEFAULT_WEBP_QUALITY,
    PROVENANCE_FILE,
    audit_portraits,
    sync_missing_portraits,
)


def _write_report(path: Path | None, payload: dict) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


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
        result = sync_missing_portraits(
            cards_path=args.cards,
            assets_dir=args.assets_dir,
            provenance_path=args.provenance,
            catalog_cache=args.catalog_cache,
            max_candidates=args.max_candidates,
            quality=args.quality,
        )
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
