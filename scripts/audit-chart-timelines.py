"""Read-only replay of verified SUS bytes. Never writes or registers Exact data.

Input SUS files must match the SHA-256 recorded by a previous verified sync.
This is an offline replay, not a fresh official-catalogue verification.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
from importlib.metadata import distribution
from io import StringIO
import json
from pathlib import Path
import re

from holodori_decksim.chart_assets import (
    CONVERTER_COMMIT, COUNTS, PARSER_COMMIT, headers, validate_timeline,
)

TARGETS = (
    "m0369:EXPERT", "m0388:HARD", "m0388:EXPERT",
    "m0549:HARD", "m0549:EXPERT", "m0551:EXPERT",
)


def require_pinned_toolchain():
    actual = {}
    for name, expected in (("holodori.scores", PARSER_COMMIT),
                           ("sonolus-converters", CONVERTER_COMMIT)):
        info = json.loads(distribution(name).read_text("direct_url.json") or "{}")
        commit = info.get("vcs_info", {}).get("commit_id")
        if commit != expected:
            raise ValueError(f"Unverified installed tool revision: {name}")
        actual[name] = commit
    return actual


def parse_sus(raw):
    from holodori.scores import chart_metadata, load_sus
    return chart_metadata(*load_sus(StringIO(raw.decode("utf-8-sig"))))


def audit_raw(raw, chart, *, parser=parse_sus):
    expected = chart.get("susSha256") or ""
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("Missing verified SUS SHA-256")
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("SUS SHA-256 mismatch; parsing refused")
    values = headers(raw, chart["musicId"], chart["fullComboNoteCount"])
    meta = parser(raw)
    counts = Counter(kind.removeprefix("critical_") for kind, _ in meta["notes"])
    report = {
        "sourceVerifiedAgainstCommittedSusSha256": True,
        "parsedTotal": len(meta["notes"]),
        "verifiedTotal": chart["fullComboNoteCount"],
        "categoryCounts": {
            kind: {"parsed": counts[kind], "sus": int(values[f"{name}_NOTE_COUNT"])}
            for kind, name in COUNTS.items()
        },
        "specialNoteCounts": {
            kind: int(values.get(f"{kind.upper()}_NOTE_COUNT", 0))
            for kind in ("damage", "ghost")
        },
        "sp": meta.get("skills", []),
        "fever": meta.get("fever"),
    }
    try:
        validate_timeline(meta, chart, values)
    except (ValueError, AssertionError, KeyError, IndexError, ZeroDivisionError) as error:
        report.update(status="rejected", error=f"{type(error).__name__}: {error}")
    else:
        report["status"] = "passed-existing-validator"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=Path("data/generated/chart-assets.json"))
    parser.add_argument("--sus-dir", type=Path, default=Path(".local/chart-assets"))
    parser.add_argument("--key", action="append", help="musicId:DIFFICULTY; defaults to the six PR #93 failures")
    args = parser.parse_args()
    assets = json.loads(args.assets.read_text(encoding="utf-8"))
    toolchain = require_pinned_toolchain()
    results = {}
    for key in args.key or TARGETS:
        chart = assets["charts"][key]
        source = args.sus_dir / f"{chart['chartHash']}.sus"
        base = {field: chart[field] for field in ("chartHash", "susSha256", "fullComboNoteCount")}
        if not source.exists():
            results[key] = {**base, "status": "source-unavailable"}
            continue
        try:
            results[key] = {**base, **audit_raw(source.read_bytes(), chart)}
        except (ValueError, AssertionError, KeyError, IndexError, ZeroDivisionError) as error:
            results[key] = {**base, "status": "rejected-before-or-during-parse",
                            "error": f"{type(error).__name__}: {error}"}
    report = {
        "mode": "offline-replay-no-publication",
        "verificationScope": "committed SUS SHA-256 and SUS/master headers; no new live-catalogue verification",
        "source_commit": assets["source_commit"],
        "master_version": assets["master_version"],
        "installedToolCommits": toolchain,
        "charts": results,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if all(row["status"] == "passed-existing-validator" for row in results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
