#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from holodori_decksim.music_search import build_music_search_index

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "data" / "generated"
I18N = GENERATED / "i18n"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    music = read_json(GENERATED / "music.json")
    packs = {locale: read_json(I18N / f"{locale}.json") for locale in ("ko", "en", "ja")}
    payload = build_music_search_index(music, packs)
    output = GENERATED / "music-search.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"music-search: {payload['music_count']} songs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
