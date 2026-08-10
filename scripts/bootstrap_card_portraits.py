from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
GENERATED_CARDS = ROOT / "data" / "generated" / "cards.json"
OUTPUT_DIR = ROOT / "assets" / "cards"

SOURCE_REPOSITORY = "yandereloveme/hololive-dreams-calc"
# Pin the snapshot so an initial asset bootstrap is reproducible.
SOURCE_COMMIT = "49bab989c787a9bde28efa9176d4d5ee4b108f18"
RAW_ROOT = f"https://raw.githubusercontent.com/{SOURCE_REPOSITORY}/{SOURCE_COMMIT}"


def _fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Holodori-DeckSim/0.1"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def _is_webp(content: bytes) -> bool:
    return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"


def main() -> None:
    if not GENERATED_CARDS.exists():
        raise FileNotFoundError(
            f"{GENERATED_CARDS} is missing. Run `holodori-sync --force` first."
        )

    current_cards = json.loads(GENERATED_CARDS.read_text(encoding="utf-8"))
    wanted_ids = {str(card["id"]) for card in current_cards}

    source_cards = json.loads(_fetch(f"{RAW_ROOT}/cards.json").decode("utf-8"))
    source_map: dict[str, str] = {}
    for card in source_cards:
        holodori = card.get("hd") or {}
        card_id = str(holodori.get("id") or "")
        image_name = str(card.get("img") or "")
        if card_id and image_name:
            source_map[card_id] = image_name

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    imported: list[str] = []
    existing: list[str] = []
    missing: list[str] = []

    for card_id in sorted(wanted_ids):
        destination = OUTPUT_DIR / f"{card_id}.webp"
        if destination.exists():
            existing.append(card_id)
            continue

        source_image = source_map.get(card_id)
        if not source_image:
            missing.append(card_id)
            continue

        content = _fetch(f"{RAW_ROOT}/{source_image}")
        if not _is_webp(content):
            raise ValueError(f"Source image is not WebP: {source_image}")
        destination.write_bytes(content)
        imported.append(card_id)

    report = {
        "source_repository": SOURCE_REPOSITORY,
        "source_commit": SOURCE_COMMIT,
        "source_card_count": len(source_map),
        "target_card_count": len(wanted_ids),
        "imported_count": len(imported),
        "existing_count": len(existing),
        "missing_count": len(missing),
        "missing": missing,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
