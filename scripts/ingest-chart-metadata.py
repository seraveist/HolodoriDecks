#!/usr/bin/env python3
"""Convert extracted holodori .sus charts into DeckSim timeline metadata.

Dependencies:
  pip install git+https://github.com/HolodoriDB/holodori-scores.git

Examples:
  python scripts/ingest-chart-metadata.py extracted/chart_m0001_expert.sus
  python scripts/ingest-chart-metadata.py extracted/*.sus
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from holodori.scores import chart_metadata, load_sus
except ImportError as exc:  # pragma: no cover - CLI guidance
    raise SystemExit(
        "holodori-scores is required. Install with: "
        "pip install git+https://github.com/HolodoriDB/holodori-scores.git"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "data" / "generated"
INDEX_PATH = GENERATED / "chart-index.json"
OUTPUT_DIR = GENERATED / "charts"
DIFFICULTIES = ("EASY", "NORMAL", "HARD", "EXPERT")


def load_index() -> dict:
    if not INDEX_PATH.exists():
        raise SystemExit("data/generated/chart-index.json is missing. Run node scripts/build-chart-index.mjs first.")
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def normalized_stem(path: Path) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", path.stem.lower())


def infer_chart(path: Path, charts: dict[str, dict]) -> tuple[str, str, dict]:
    stem = normalized_stem(path)
    by_asset = {
        str(row.get("chartAssetId", "")).lower(): (key, row)
        for key, row in charts.items()
        if row.get("chartAssetId")
    }
    if stem in by_asset:
        key, row = by_asset[stem]
        return row["musicId"], row["difficulty"], row

    music_match = re.search(r"m\d{4}", stem)
    difficulty = next((name for name in DIFFICULTIES if name.lower() in stem), None)
    if music_match and difficulty:
        key = f"{music_match.group(0)}:{difficulty}"
        if key in charts:
            row = charts[key]
            return row["musicId"], row["difficulty"], row

    raise ValueError(
        f"Cannot map {path.name} to chart-index. Name the file like chart_m0001_expert.sus "
        "or m0001-expert.sus."
    )


def normalize_metadata(meta: dict) -> dict:
    return {
        "notes": meta.get("notes", []),
        "skills": [
            {
                "slot": int(skill.get("skill_slot_no", 0)),
                "time": float(skill.get("time", 0)),
                "combo": int(skill.get("skill_starts_at_combo", 0)),
            }
            for skill in meta.get("skills", [])
            if int(skill.get("skill_slot_no", 0)) > 0
        ],
        "fever": meta.get("fever"),
    }


def convert(path: Path, charts: dict[str, dict]) -> Path:
    music_id, difficulty, chart = infer_chart(path, charts)
    score, bar_lengths = load_sus(path)
    metadata = normalize_metadata(chart_metadata(score, bar_lengths))
    output = {
        "version": 1,
        "musicId": music_id,
        "difficulty": difficulty,
        "chartHash": chart.get("chartHash"),
        "chartAssetId": chart.get("chartAssetId"),
        "fullComboNoteCount": chart.get("fullComboNoteCount"),
        "sourceFile": path.name,
        **metadata,
    }

    actual = len(metadata["notes"])
    expected = int(chart.get("fullComboNoteCount") or 0)
    if expected and actual != expected:
        print(
            f"warning: {music_id} {difficulty} metadata note count {actual} != master full combo {expected}",
            file=sys.stderr,
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUTPUT_DIR / f"{music_id}-{difficulty}.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sus", nargs="+", type=Path, help="Extracted holodori .sus files")
    args = parser.parse_args()
    index = load_index()
    charts = index.get("charts", {})
    failed = 0
    for source in args.sus:
        try:
            target = convert(source, charts)
            print(f"wrote {target.relative_to(ROOT)}")
        except Exception as exc:  # pragma: no cover - batch CLI should continue
            failed += 1
            print(f"error: {source}: {exc}", file=sys.stderr)
    if failed:
        raise SystemExit(1)
    print("Run node scripts/build-chart-index.mjs again to register metadataPath entries.")


if __name__ == "__main__":
    main()
