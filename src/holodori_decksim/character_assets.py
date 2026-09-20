"""Member face icons, independent of card art and Master-data publication."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .card_assets import (
    ROOT, ASSET_TOOL_REPOSITORY, ASSET_TOOL_COMMIT,
    _extract_image_candidates, _runtime_dependencies,
)

CHARACTERS_FILE = ROOT / "data/generated/characters.json"
ASSET_DIR = ROOT / "assets/characters"
PROVENANCE_FILE = ROOT / "assets/character-portrait-sync.json"


def build_targets(characters_path: Path, assets_dir: Path) -> list[dict[str, Any]]:
    targets = []
    seen = set()
    for row in json.loads(characters_path.read_text(encoding="utf-8")):
        if not row.get("board_layout_id"):
            continue
        character_id, asset_id = str(row.get("id", "")), str(row.get("asset_id", ""))
        if not re.fullmatch(r"chr-[0-9]{5}", character_id) or not re.fullmatch(r"[0-9]{5}", asset_id):
            raise ValueError(f"Invalid member portrait identity: {character_id!r}, {asset_id!r}")
        if character_id in seen:
            raise ValueError(f"Duplicate member portrait identity: {character_id}")
        seen.add(character_id)
        targets.append({"id": character_id, "asset_id": asset_id,
                        "bundle": f"img_chr_icon_normal_{asset_id}",
                        "destination": assets_dir / f"{character_id}.webp"})
    return targets


def valid_icon(path: Path) -> bool:
    if not path.is_file():
        return False
    from PIL import Image
    try:
        with Image.open(path) as image:
            valid = image.format == "WEBP" and image.size == (256, 256)
            image.load()
            return valid
    except (OSError, ValueError):
        return False


def audit_portraits(characters_path: Path = CHARACTERS_FILE, assets_dir: Path = ASSET_DIR) -> dict:
    targets = build_targets(characters_path, assets_dir)
    missing = [{"id": row["id"], "asset_id": row["asset_id"]}
               for row in targets if not valid_icon(row["destination"])]
    return {"target_count": len(targets), "existing_count": len(targets) - len(missing),
            "missing_count": len(missing), "missing": missing}


def _download_icon(target, catalog, entry, client, crypto, unity) -> tuple[Any, list[dict]]:
    payloads, sources = [], []
    for bundle in catalog.required(entry.name, "assetbundles") or [entry]:
        response = client.get(bundle.url)
        response.raise_for_status()
        raw = response.content
        if len(raw) != bundle.size or not bundle.md5 or hashlib.md5(raw).hexdigest() != bundle.md5.lower():
            raise ValueError(f"Bundle integrity mismatch: {bundle.name}")
        sources.append({"name": bundle.name, "md5": bundle.md5, "size": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest()})
        payloads.append(crypto.decrypt(raw, bundle.name))
    matches = [image for image in _extract_image_candidates(unity, payloads)
               if image.name == target["bundle"] and (image.width, image.height) == (256, 256)]
    if not matches:
        raise ValueError(f"Expected 256x256 member icon not found: {target['bundle']}")
    matches.sort(key=lambda image: image.kind != "Sprite")
    return matches[0], sources


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def sync_missing_portraits(*, characters_path: Path = CHARACTERS_FILE, assets_dir: Path = ASSET_DIR,
                          provenance_path: Path = PROVENANCE_FILE, catalog_cache: Path | None = None) -> dict:
    before = audit_portraits(characters_path, assets_dir)
    missing_ids = {row["id"] for row in before["missing"]}
    targets = [row for row in build_targets(characters_path, assets_dir) if row["id"] in missing_ids]
    imported, unresolved = [], []
    revision = None
    # No network or optional asset-tool import when all icons are already valid.
    if targets:
        try:
            httpx, unity, _image, catalog_module, crypto = _runtime_dependencies()
            catalog = catalog_module.get(catalog_cache)
            revision = int(catalog.revisionId)
        except Exception as exc:
            unresolved = [{"id": row["id"], "status": "error", "reason": f"{type(exc).__name__}: {exc}"}
                          for row in targets]
        else:
            entries = {entry.name: entry for entry in catalog.assetBundles}
            provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.exists() else {}
            records = provenance.get("characters", {})
            with httpx.Client(http2=True, timeout=60, follow_redirects=True) as client:
                for target in targets:
                    entry = entries.get(target["bundle"])
                    if entry is None:
                        unresolved.append({"id": target["id"], "status": "pending", "reason": "Member icon not yet in catalog"})
                        continue
                    temporary = target["destination"].with_suffix(".webp.tmp")
                    try:
                        image, sources = _download_icon(target, catalog, entry, client, crypto, unity)
                        target["destination"].parent.mkdir(parents=True, exist_ok=True)
                        image.image.convert("RGBA").save(temporary, format="WEBP", lossless=True, method=6)
                        if not valid_icon(temporary):
                            raise ValueError("Invalid normalized member icon")
                        record = {"asset_id": target["asset_id"], "catalog_revision": revision,
                                  "catalog_entry": entry.name, "unity_object": image.name, "unity_object_type": image.kind,
                                  "width": 256, "height": 256, "sources": sources,
                                  "sha256": hashlib.sha256(temporary.read_bytes()).hexdigest()}
                        temporary.replace(target["destination"])
                        records[target["id"]] = record
                        imported.append({"id": target["id"], **record})
                    except Exception as exc:
                        unresolved.append({"id": target["id"], "status": "error", "reason": f"{type(exc).__name__}: {exc}"})
                    finally:
                        temporary.unlink(missing_ok=True)
            if imported:
                _write_json(provenance_path, {"version": 1, "source": "Holodori game Octo CDN",
                            "tool_repository": ASSET_TOOL_REPOSITORY, "tool_commit": ASSET_TOOL_COMMIT,
                            "characters": records})
    return {"before": before, "after": audit_portraits(characters_path, assets_dir),
            "catalog_revision": revision, "imported": imported, "imported_count": len(imported),
            "unresolved": unresolved, "unresolved_count": len(unresolved),
            "pending_count": sum(row["status"] == "pending" for row in unresolved),
            "error_count": sum(row["status"] == "error" for row in unresolved)}
