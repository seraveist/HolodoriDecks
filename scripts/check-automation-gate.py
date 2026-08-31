#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from holodori_decksim.automation_gate import (
    evaluate_card_asset_gate,
    evaluate_master_gate,
    read_diff_lines,
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def emit(result, output: Path | None) -> None:
    payload = result.to_dict()
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if output is not None:
        output.write_text(text, encoding="utf-8")
    print(text, end="")


def master(args: argparse.Namespace) -> None:
    result = evaluate_master_gate(
        previous_cards=load_json(args.previous_cards),
        current_cards=load_json(args.current_cards),
        previous_characters=load_json(args.previous_characters),
        current_characters=load_json(args.current_characters),
        previous_music=load_json(args.previous_music),
        current_music=load_json(args.current_music),
        previous_chart_index=load_json(args.previous_chart_index),
        current_chart_index=load_json(args.current_chart_index),
        previous_runtime_index=load_json(args.previous_runtime_index),
        current_runtime_index=load_json(args.current_runtime_index),
    )
    emit(result, args.output)


def card_assets(args: argparse.Namespace) -> None:
    result = evaluate_card_asset_gate(
        report=load_json(args.report),
        diff_lines=read_diff_lines(args.diff),
    )
    emit(result, args.output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate guarded automatic-merge policy")
    subparsers = parser.add_subparsers(dest="kind", required=True)

    master_parser = subparsers.add_parser("master")
    master_parser.add_argument("--previous-cards", type=Path, required=True)
    master_parser.add_argument("--current-cards", type=Path, required=True)
    master_parser.add_argument("--previous-characters", type=Path, required=True)
    master_parser.add_argument("--current-characters", type=Path, required=True)
    master_parser.add_argument("--previous-music", type=Path, required=True)
    master_parser.add_argument("--current-music", type=Path, required=True)
    master_parser.add_argument("--previous-chart-index", type=Path, required=True)
    master_parser.add_argument("--current-chart-index", type=Path, required=True)
    master_parser.add_argument("--previous-runtime-index", type=Path, required=True)
    master_parser.add_argument("--current-runtime-index", type=Path, required=True)
    master_parser.add_argument("--output", type=Path)
    master_parser.set_defaults(func=master)

    card_parser = subparsers.add_parser("card-assets")
    card_parser.add_argument("--report", type=Path, required=True)
    card_parser.add_argument("--diff", type=Path, required=True)
    card_parser.add_argument("--output", type=Path)
    card_parser.set_defaults(func=card_assets)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
