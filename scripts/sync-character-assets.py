#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from holodori_decksim.character_assets import (
    CHARACTERS_FILE, ASSET_DIR, PROVENANCE_FILE, audit_portraits, sync_missing_portraits,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize official member face icons")
    parser.add_argument("--sync", action="store_true")
    parser.add_argument("--require-complete", action="store_true")
    parser.add_argument("--characters", type=Path, default=CHARACTERS_FILE)
    parser.add_argument("--assets-dir", type=Path, default=ASSET_DIR)
    parser.add_argument("--provenance", type=Path, default=PROVENANCE_FILE)
    parser.add_argument("--catalog-cache", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.sync:
        report = sync_missing_portraits(characters_path=args.characters, assets_dir=args.assets_dir,
                                       provenance_path=args.provenance, catalog_cache=args.catalog_cache)
    else:
        report = audit_portraits(args.characters, args.assets_dir)
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.write_text(text, encoding="utf-8")
    print(text, end="")
    if report.get("error_count") or (args.require_complete and report.get("after", report)["missing_count"]):
        return 1
    return 2 if report.get("pending_count") else 0


if __name__ == "__main__":
    raise SystemExit(main())
