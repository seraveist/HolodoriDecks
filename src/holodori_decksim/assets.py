from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "data" / "generated"
ASSET_DIR = ROOT / "assets"

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga"}


@dataclass(frozen=True)
class AssetTarget:
    kind: str
    item_id: str
    upstream_asset_id: str
    destination: Path


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _iter_images(source_root: Path) -> list[Path]:
    return sorted(
        path
        for path in source_root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def build_targets() -> list[AssetTarget]:
    cards = _load_json(GENERATED_DIR / "cards.json")
    music = _load_json(GENERATED_DIR / "music.json")

    targets: list[AssetTarget] = []
    for card in cards:
        asset_id = str(card.get("asset_id") or "").strip()
        if not asset_id:
            continue
        card_id = str(card["id"])
        targets.append(
            AssetTarget(
                kind="card",
                item_id=card_id,
                upstream_asset_id=asset_id,
                destination=ASSET_DIR / "cards" / f"{card_id}.webp",
            )
        )

    for track in music:
        asset_id = str(track.get("jacket_asset_id") or "").strip()
        if not asset_id:
            continue
        music_id = str(track["id"])
        targets.append(
            AssetTarget(
                kind="music",
                item_id=music_id,
                upstream_asset_id=asset_id,
                destination=ASSET_DIR / "music" / f"{music_id}.webp",
            )
        )

    return targets


def candidate_score(path: Path, asset_id: str) -> int:
    asset_token = _normalize_token(asset_id)
    if not asset_token:
        return 0

    stem_token = _normalize_token(path.stem)
    path_token = _normalize_token(path.as_posix())

    if stem_token == asset_token:
        return 100
    if stem_token.endswith(asset_token) or stem_token.startswith(asset_token):
        return 90
    if asset_token in stem_token:
        return 80
    if asset_token in path_token:
        return 60
    return 0


def find_candidates(images: list[Path], asset_id: str) -> list[Path]:
    scored = [(candidate_score(path, asset_id), path) for path in images]
    return [path for score, path in sorted(scored, key=lambda item: (-item[0], str(item[1]))) if score]


def _load_overrides(source_root: Path, path: Path | None) -> dict[tuple[str, str], Path]:
    if path is None or not path.exists():
        return {}

    payload = _load_json(path)
    overrides: dict[tuple[str, str], Path] = {}
    for kind_key, kind_name in (("cards", "card"), ("music", "music")):
        for item_id, relative_path in payload.get(kind_key, {}).items():
            overrides[(kind_name, item_id)] = source_root / str(relative_path)
    return overrides


def _convert_to_webp(source: Path, destination: Path, max_size: int, quality: int) -> None:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:  # pragma: no cover - depends on optional asset extra
        raise RuntimeError("Asset import requires Pillow. Install with: pip install -e '.[assets]'") from exc

    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA")
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        image.save(destination, format="WEBP", quality=quality, method=6)


def import_assets(
    source_root: Path,
    *,
    overrides_path: Path | None = None,
    dry_run: bool = False,
    overwrite: bool = False,
    quality: int = 90,
) -> dict[str, Any]:
    if not source_root.exists():
        raise FileNotFoundError(source_root)

    images = _iter_images(source_root)
    targets = build_targets()
    overrides = _load_overrides(source_root, overrides_path)

    imported: list[dict[str, str]] = []
    skipped: list[str] = []
    missing: list[dict[str, str]] = []
    ambiguous: list[dict[str, Any]] = []

    for target in targets:
        if target.destination.exists() and not overwrite:
            skipped.append(target.item_id)
            continue

        override = overrides.get((target.kind, target.item_id))
        candidates = [override] if override else find_candidates(images, target.upstream_asset_id)
        candidates = [path for path in candidates if path and path.exists()]

        if not candidates:
            missing.append(
                {
                    "kind": target.kind,
                    "id": target.item_id,
                    "asset_id": target.upstream_asset_id,
                }
            )
            continue

        if not override and len(candidates) > 1:
            top_score = candidate_score(candidates[0], target.upstream_asset_id)
            same_score = [
                path for path in candidates if candidate_score(path, target.upstream_asset_id) == top_score
            ]
            if len(same_score) > 1:
                ambiguous.append(
                    {
                        "kind": target.kind,
                        "id": target.item_id,
                        "asset_id": target.upstream_asset_id,
                        "candidates": [str(path.relative_to(source_root)) for path in same_score[:10]],
                    }
                )
                continue

        source = candidates[0]
        if not dry_run:
            max_size = 768 if target.kind == "card" else 512
            _convert_to_webp(source, target.destination, max_size=max_size, quality=quality)

        imported.append(
            {
                "kind": target.kind,
                "id": target.item_id,
                "asset_id": target.upstream_asset_id,
                "source": str(source.relative_to(source_root)),
                "destination": str(target.destination.relative_to(ROOT)),
            }
        )

    return {
        "source_root": str(source_root),
        "image_count": len(images),
        "target_count": len(targets),
        "imported": imported,
        "skipped_count": len(skipped),
        "missing": missing,
        "ambiguous": ambiguous,
        "dry_run": dry_run,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import locally extracted hololive Dreams images into static GitHub Pages assets"
    )
    parser.add_argument("source", type=Path, help="root folder containing extracted image files")
    parser.add_argument(
        "--map",
        dest="overrides_path",
        type=Path,
        default=ASSET_DIR / "source-map.json",
        help="optional explicit card/music source mapping JSON",
    )
    parser.add_argument("--dry-run", action="store_true", help="report matches without writing files")
    parser.add_argument("--overwrite", action="store_true", help="replace already imported WebP files")
    parser.add_argument("--quality", type=int, default=90, choices=range(1, 101), metavar="1-100")
    args = parser.parse_args()

    result = import_assets(
        args.source,
        overrides_path=args.overrides_path,
        dry_run=args.dry_run,
        overwrite=args.overwrite,
        quality=args.quality,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
