from __future__ import annotations

import argparse
import json
from pathlib import Path

from holodori_asset_tools import catalog


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect hololive Dreams Octo asset catalog")
    parser.add_argument("needles", nargs="*", help="case-insensitive substrings to search")
    parser.add_argument("--catalog", default="octo_list.json", help="catalog cache path")
    parser.add_argument("--limit", type=int, default=200, help="maximum matches to print")
    args = parser.parse_args()

    needles = [needle.lower() for needle in args.needles]
    cat = catalog.get(args.catalog)

    rows: list[dict[str, object]] = []
    for kind, entries in (("assetbundle", cat.assetBundles), ("resource", cat.resources)):
        for entry in entries:
            haystack = f"{entry.name} {entry.objectName}".lower()
            if needles and not any(needle in haystack for needle in needles):
                continue
            rows.append(
                {
                    "kind": kind,
                    "name": entry.name,
                    "object_name": entry.objectName,
                    "size": entry.size,
                    "dependencies": entry.dependencies,
                }
            )

    rows.sort(key=lambda row: (str(row["kind"]), str(row["name"])))
    print(
        json.dumps(
            {
                "revision_id": cat.revisionId,
                "assetbundle_count": len(cat.assetBundles),
                "resource_count": len(cat.resources),
                "needles": args.needles,
                "matches": rows[: args.limit],
                "match_count": len(rows),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
