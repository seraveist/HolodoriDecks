from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
CARDS_FILE = ROOT / "data" / "generated" / "cards.json"
ASSET_DIR = ROOT / "assets" / "cards"
PROVENANCE_FILE = ROOT / "assets" / "card-portrait-sync.json"
SUPPORTED_RARITIES = {4, 5}
MAX_IMAGE_DIMENSION = 768
DEFAULT_WEBP_QUALITY = 90
ASSET_TOOL_REPOSITORY = "HolodoriDB/holodori-asset-tools"
ASSET_TOOL_COMMIT = "85b70c9b0024e91ea566dacafe8374e1c4212cf5"
UNITY_FALLBACK_VERSION = "6000.3.15f1"


@dataclass(frozen=True)
class CardAssetTarget:
    card_id: str
    asset_id: str
    destination: Path


@dataclass(frozen=True)
class ImageCandidate:
    name: str
    kind: str
    width: int
    height: int
    image: Any


def _load_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def build_targets(
    cards_path: Path = CARDS_FILE,
    assets_dir: Path = ASSET_DIR,
) -> list[CardAssetTarget]:
    cards = _load_json(cards_path, []) or []
    targets: list[CardAssetTarget] = []
    for card in cards:
        if int(card.get("rarity") or 0) not in SUPPORTED_RARITIES:
            continue
        card_id = str(card.get("id") or "").strip()
        asset_id = str(card.get("asset_id") or "").strip()
        if not card_id or not asset_id:
            continue
        targets.append(
            CardAssetTarget(
                card_id=card_id,
                asset_id=asset_id,
                destination=assets_dir / f"{card_id}.webp",
            )
        )
    return targets


def audit_portraits(
    cards_path: Path = CARDS_FILE,
    assets_dir: Path = ASSET_DIR,
) -> dict[str, Any]:
    targets = build_targets(cards_path, assets_dir)
    missing = [
        {
            "id": target.card_id,
            "asset_id": target.asset_id,
            "destination": str(target.destination.relative_to(ROOT))
            if target.destination.is_relative_to(ROOT)
            else str(target.destination),
        }
        for target in targets
        if not target.destination.is_file()
    ]
    return {
        "supported_rarities": sorted(SUPPORTED_RARITIES),
        "target_count": len(targets),
        "existing_count": len(targets) - len(missing),
        "missing_count": len(missing),
        "missing": missing,
    }


def catalog_entry_score(entry: Any, asset_id: str) -> int:
    name = str(getattr(entry, "name", "") or "")
    object_name = str(getattr(entry, "objectName", "") or "")
    raw = f"{name} {object_name}".lower()
    normalized = _normalize_token(raw)
    needle = _normalize_token(asset_id)
    parts = [part.lower() for part in str(asset_id).split("-") if part]
    character_token = _normalize_token(parts[0]) if parts else ""
    sequence_token = _normalize_token(parts[-2]) if len(parts) >= 2 else ""

    exact = bool(needle and needle in normalized)
    structural = bool(
        character_token
        and sequence_token
        and character_token in normalized
        and sequence_token in normalized
        and "card" in raw
    )
    if not exact and not structural:
        return 0

    score = 240 if exact else 120
    if "card" in raw:
        score += 50
    if any(token in raw for token in ("illust", "illustration", "image", "still", "portrait")):
        score += 35
    if any(token in raw for token in ("thumb", "thumbnail")):
        score -= 15
    if any(token in raw for token in ("movie", "video", "usm", "voice", "costume", "sdcos")):
        score -= 80
    if _normalize_token(name).endswith(needle):
        score += 20
    return max(score, 0)


def find_catalog_candidates(catalog: Any, asset_id: str, limit: int = 12) -> list[Any]:
    scored = [
        (catalog_entry_score(entry, asset_id), entry)
        for entry in getattr(catalog, "assetBundles", [])
    ]
    matches = [(score, entry) for score, entry in scored if score > 0]
    matches.sort(key=lambda item: (-item[0], str(getattr(item[1], "name", ""))))
    return [entry for _, entry in matches[:limit]]


def image_candidate_score(
    name: str,
    kind: str,
    width: int,
    height: int,
    asset_id: str,
) -> int:
    if width < 128 or height < 128:
        return -1000

    normalized_name = _normalize_token(name)
    needle = _normalize_token(asset_id)
    raw = str(name).lower()
    score = 0
    if needle and needle in normalized_name:
        score += 240

    parts = [part.lower() for part in str(asset_id).split("-") if part]
    if parts:
        if _normalize_token(parts[0]) in normalized_name:
            score += 20
        if len(parts) >= 2 and _normalize_token(parts[-2]) in normalized_name:
            score += 30

    if kind == "Sprite":
        score += 35
    if any(token in raw for token in ("illust", "illustration", "card", "main", "still", "portrait")):
        score += 35
    if any(token in raw for token in ("icon", "mask", "frame", "thumb", "thumbnail")):
        score -= 45

    area = max(1, width * height)
    score += min(40, int(math.log2(area)) - 14)
    return score


def _choose_image(images: Iterable[ImageCandidate], asset_id: str) -> ImageCandidate | None:
    ranked = sorted(
        images,
        key=lambda item: (
            -image_candidate_score(item.name, item.kind, item.width, item.height, asset_id),
            -(item.width * item.height),
            item.name,
        ),
    )
    if not ranked:
        return None
    best = ranked[0]
    if image_candidate_score(best.name, best.kind, best.width, best.height, asset_id) < 0:
        return None
    return best


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_provenance(path: Path) -> dict[str, Any]:
    payload = _load_json(path, {}) or {}
    if not isinstance(payload, dict):
        payload = {}
    cards = payload.get("cards")
    if not isinstance(cards, dict):
        cards = {}
    return {
        "version": 1,
        "source": "Holodori game Octo CDN",
        "tool_repository": ASSET_TOOL_REPOSITORY,
        "tool_commit": ASSET_TOOL_COMMIT,
        "cards": cards,
    }


def _write_provenance(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _runtime_dependencies() -> tuple[Any, Any, Any, Any, Any]:
    try:
        import httpx
        import UnityPy
        from PIL import Image
        from holodori_asset_tools import catalog, crypto
    except ImportError as exc:  # pragma: no cover - exercised in live workflow
        raise RuntimeError(
            "Card asset sync requires HolodoriDB/holodori-asset-tools. "
            f"Install: pip install 'git+https://github.com/{ASSET_TOOL_REPOSITORY}.git@{ASSET_TOOL_COMMIT}'"
        ) from exc
    return httpx, UnityPy, Image, catalog, crypto


def _download_required_bundle_payloads(
    catalog: Any,
    entry: Any,
    client: Any,
    crypto: Any,
) -> list[bytes]:
    required = catalog.required(entry.name, "assetbundles") or [entry]
    payloads: list[bytes] = []
    for required_entry in required:
        response = client.get(required_entry.url)
        response.raise_for_status()
        payloads.append(crypto.decrypt(response.content, required_entry.name))
    return payloads


def _extract_image_candidates(UnityPy: Any, payloads: list[bytes]) -> list[ImageCandidate]:
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_FALLBACK_VERSION
    environment = UnityPy.Environment(*payloads)
    images: list[ImageCandidate] = []
    for obj in environment.objects:
        kind = str(getattr(getattr(obj, "type", None), "name", ""))
        if kind not in {"Sprite", "Texture2D"}:
            continue
        try:
            data = obj.read()
            image = data.image.copy()
        except Exception:
            continue
        name = str(getattr(data, "m_Name", "") or getattr(obj, "path_id", ""))
        images.append(
            ImageCandidate(
                name=name,
                kind=kind,
                width=int(getattr(image, "width", 0) or 0),
                height=int(getattr(image, "height", 0) or 0),
                image=image,
            )
        )
    return images


def _save_webp(image: Any, destination: Path, quality: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = image.copy()
    if result.mode not in {"RGB", "RGBA"}:
        result = result.convert("RGBA")
    result.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
    result.save(destination, format="WEBP", quality=quality, method=6)


def sync_missing_portraits(
    *,
    cards_path: Path = CARDS_FILE,
    assets_dir: Path = ASSET_DIR,
    provenance_path: Path = PROVENANCE_FILE,
    catalog_cache: Path | None = None,
    max_candidates: int = 12,
    quality: int = DEFAULT_WEBP_QUALITY,
) -> dict[str, Any]:
    httpx, UnityPy, _Image, catalog_module, crypto = _runtime_dependencies()
    before = audit_portraits(cards_path, assets_dir)
    targets_by_id = {target.card_id: target for target in build_targets(cards_path, assets_dir)}
    missing_targets = [targets_by_id[item["id"]] for item in before["missing"]]

    catalog = catalog_module.get(catalog_cache)
    provenance = _load_provenance(provenance_path)
    provenance["catalog_revision"] = int(getattr(catalog, "revisionId", 0) or 0)
    imported: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    with httpx.Client(http2=True, timeout=120, follow_redirects=True) as client:
        for target in missing_targets:
            candidates = find_catalog_candidates(catalog, target.asset_id, limit=max_candidates)
            attempts: list[dict[str, Any]] = []
            selected: ImageCandidate | None = None
            selected_entry: Any | None = None

            for entry in candidates:
                try:
                    payloads = _download_required_bundle_payloads(catalog, entry, client, crypto)
                    images = _extract_image_candidates(UnityPy, payloads)
                    chosen = _choose_image(images, target.asset_id)
                    attempts.append(
                        {
                            "entry": str(getattr(entry, "name", "")),
                            "object_name": str(getattr(entry, "objectName", "")),
                            "image_count": len(images),
                            "chosen": chosen.name if chosen else None,
                        }
                    )
                    if chosen is not None:
                        selected = chosen
                        selected_entry = entry
                        break
                except Exception as exc:
                    attempts.append(
                        {
                            "entry": str(getattr(entry, "name", "")),
                            "error": f"{type(exc).__name__}: {exc}",
                        }
                    )

            if selected is None or selected_entry is None:
                unresolved.append(
                    {
                        "id": target.card_id,
                        "asset_id": target.asset_id,
                        "catalog_candidates": [str(getattr(entry, "name", "")) for entry in candidates],
                        "attempts": attempts,
                    }
                )
                continue

            _save_webp(selected.image, target.destination, quality)
            record = {
                "asset_id": target.asset_id,
                "catalog_revision": int(getattr(catalog, "revisionId", 0) or 0),
                "catalog_entry": str(getattr(selected_entry, "name", "")),
                "catalog_object_name": str(getattr(selected_entry, "objectName", "")),
                "unity_object": selected.name,
                "unity_object_type": selected.kind,
                "width": selected.width,
                "height": selected.height,
                "sha256": _sha256_file(target.destination),
            }
            provenance["cards"][target.card_id] = record
            imported.append({"id": target.card_id, **record})

    if imported:
        provenance["cards"] = dict(sorted(provenance["cards"].items()))
        _write_provenance(provenance_path, provenance)

    after = audit_portraits(cards_path, assets_dir)
    return {
        "asset_tool_repository": ASSET_TOOL_REPOSITORY,
        "asset_tool_commit": ASSET_TOOL_COMMIT,
        "catalog_revision": int(getattr(catalog, "revisionId", 0) or 0),
        "before": before,
        "imported_count": len(imported),
        "imported": imported,
        "unresolved_count": len(unresolved),
        "unresolved": unresolved,
        "after": after,
    }
