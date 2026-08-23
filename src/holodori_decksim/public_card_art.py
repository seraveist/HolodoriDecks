from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

from .card_assets import ASSET_DIR, CARDS_FILE, PROVENANCE_FILE, ROOT, audit_portraits, build_targets

PUBLIC_ART_REPOSITORY = "asciisyaez/yagoo-dori"
PUBLIC_ART_REF = "main"
PUBLIC_ART_MANIFEST_PATH = "data/generated/card-art-manifest.json"
PUBLIC_ART_WEB_ROOT = "apps/web/public"
GITHUB_API_ROOT = "https://api.github.com"
RAW_GITHUB_ROOT = "https://raw.githubusercontent.com"


def _request_bytes(url: str, *, accept: str = "application/octet-stream") -> bytes:
    headers = {
        "Accept": accept,
        "User-Agent": "HolodoriDeckSim-card-art-sync/1.0",
    }
    token = os.getenv("GITHUB_TOKEN", "")
    if token and url.startswith(GITHUB_API_ROOT):
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=60) as response:  # noqa: S310 - fixed GitHub hosts
        return response.read()


def _request_json(url: str) -> Any:
    return json.loads(_request_bytes(url, accept="application/vnd.github+json").decode("utf-8"))


def resolve_public_art_commit(
    repository: str = PUBLIC_ART_REPOSITORY,
    ref: str = PUBLIC_ART_REF,
) -> str:
    payload = _request_json(f"{GITHUB_API_ROOT}/repos/{repository}/commits/{ref}")
    commit = str(payload.get("sha", "")).lower()
    if len(commit) != 40 or any(char not in "0123456789abcdef" for char in commit):
        raise ValueError(f"Unable to resolve public card-art commit for {repository}@{ref}")
    return commit


def public_art_manifest_url(
    commit: str,
    repository: str = PUBLIC_ART_REPOSITORY,
) -> str:
    return f"{RAW_GITHUB_ROOT}/{repository}/{commit}/{PUBLIC_ART_MANIFEST_PATH}"


def public_art_asset_path(local_path: str) -> str:
    normalized = "/" + str(local_path).lstrip("/")
    if not normalized.startswith("/game/cards/") or not normalized.endswith(".webp"):
        raise ValueError(f"unexpected public card-art path: {local_path!r}")
    return f"{PUBLIC_ART_WEB_ROOT}{normalized}"


def public_art_asset_url(
    commit: str,
    local_path: str,
    repository: str = PUBLIC_ART_REPOSITORY,
) -> str:
    path = public_art_asset_path(local_path)
    encoded = "/".join(quote(part) for part in path.split("/"))
    return f"{RAW_GITHUB_ROOT}/{repository}/{commit}/{encoded}"


def index_public_art_manifest(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    assets = manifest.get("assets", [])
    if not isinstance(assets, list):
        raise ValueError("public card-art manifest assets must be an array")
    indexed: dict[str, dict[str, Any]] = {}
    for row in assets:
        if not isinstance(row, dict):
            continue
        card_id = str(row.get("cardId") or "")
        if card_id:
            indexed[card_id] = row
    return indexed


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _load_provenance(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    cards = payload.get("cards")
    if not isinstance(cards, dict):
        cards = {}
    payload["version"] = max(2, int(payload.get("version") or 0))
    payload["cards"] = cards
    return payload


def _write_provenance(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload["cards"] = dict(sorted(payload["cards"].items()))
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _validate_webp(content: bytes, icon: dict[str, Any]) -> tuple[int, int]:
    if len(content) < 12 or content[:4] != b"RIFF" or content[8:12] != b"WEBP":
        raise ValueError("public card art is not WebP")
    expected_sha = str(icon.get("sha256") or "").lower()
    actual_sha = _sha256_bytes(content)
    if expected_sha and actual_sha != expected_sha:
        raise ValueError(f"public card-art SHA-256 mismatch: {actual_sha} != {expected_sha}")

    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - live workflow installs Pillow via asset tooling
        raise RuntimeError("public card-art validation requires Pillow") from exc

    with Image.open(io.BytesIO(content)) as image:
        if image.format != "WEBP":
            raise ValueError(f"public card art decoded as {image.format}, expected WEBP")
        width, height = image.size

    expected_width = int(icon.get("width") or 0)
    expected_height = int(icon.get("height") or 0)
    if expected_width and width != expected_width:
        raise ValueError(f"public card-art width mismatch: {width} != {expected_width}")
    if expected_height and height != expected_height:
        raise ValueError(f"public card-art height mismatch: {height} != {expected_height}")
    if width < 128 or height < 128 or width > 768 or height > 768:
        raise ValueError(f"public card-art dimensions out of bounds: {width}x{height}")
    return width, height


def sync_public_snapshot_portraits(
    *,
    cards_path: Path = CARDS_FILE,
    assets_dir: Path = ASSET_DIR,
    provenance_path: Path = PROVENANCE_FILE,
    repository: str = PUBLIC_ART_REPOSITORY,
    ref: str = PUBLIC_ART_REF,
) -> dict[str, Any]:
    before = audit_portraits(cards_path, assets_dir)
    if before["missing_count"] == 0:
        return {
            "source_repository": repository,
            "source_commit": None,
            "before": before,
            "imported_count": 0,
            "imported": [],
            "unresolved_count": 0,
            "unresolved": [],
            "after": before,
        }

    commit = resolve_public_art_commit(repository, ref)
    manifest = json.loads(
        _request_bytes(public_art_manifest_url(commit, repository), accept="application/json").decode("utf-8")
    )
    indexed = index_public_art_manifest(manifest)
    targets_by_id = {target.card_id: target for target in build_targets(cards_path, assets_dir)}
    provenance = _load_provenance(provenance_path)
    provenance.setdefault("public_card_art", {})
    provenance["public_card_art"].update(
        {
            "repository": repository,
            "commit": commit,
            "manifest_path": PUBLIC_ART_MANIFEST_PATH,
            "retrieved_at": manifest.get("retrievedAt"),
        }
    )

    imported: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for missing in before["missing"]:
        card_id = missing["id"]
        target = targets_by_id[card_id]
        row = indexed.get(card_id)
        icon = row.get("icon") if isinstance(row, dict) else None
        if not isinstance(icon, dict):
            unresolved.append(
                {
                    "id": card_id,
                    "asset_id": target.asset_id,
                    "reason": "card icon missing from public snapshot manifest",
                }
            )
            continue

        local_path = str(icon.get("localPath") or "")
        expected_path = f"/game/cards/{card_id}.webp"
        if local_path != expected_path:
            unresolved.append(
                {
                    "id": card_id,
                    "asset_id": target.asset_id,
                    "reason": f"unexpected public snapshot path: {local_path!r}",
                }
            )
            continue

        try:
            source_path = public_art_asset_path(local_path)
            source_url = public_art_asset_url(commit, local_path, repository)
            content = _request_bytes(source_url, accept="image/webp,image/*;q=0.9,*/*;q=0.5")
            width, height = _validate_webp(content, icon)
            target.destination.parent.mkdir(parents=True, exist_ok=True)
            target.destination.write_bytes(content)
        except Exception as exc:
            unresolved.append(
                {
                    "id": card_id,
                    "asset_id": target.asset_id,
                    "reason": f"{type(exc).__name__}: {exc}",
                }
            )
            continue

        record = {
            "asset_id": target.asset_id,
            "source_type": "public-card-art-snapshot",
            "source_repository": repository,
            "source_commit": commit,
            "source_manifest": PUBLIC_ART_MANIFEST_PATH,
            "source_path": source_path,
            "source_page": icon.get("sourcePage"),
            "source_url": icon.get("sourceUrl"),
            "retrieved_at": icon.get("retrievedAt") or manifest.get("retrievedAt"),
            "width": width,
            "height": height,
            "sha256": _sha256_bytes(content),
            "unity_object_type": "WebP",
            "unity_object": source_path,
        }
        provenance["cards"][card_id] = record
        imported.append({"id": card_id, **record})

    if imported:
        _write_provenance(provenance_path, provenance)

    after = audit_portraits(cards_path, assets_dir)
    return {
        "source_repository": repository,
        "source_commit": commit,
        "before": before,
        "imported_count": len(imported),
        "imported": imported,
        "unresolved_count": len(unresolved),
        "unresolved": unresolved,
        "after": after,
    }
