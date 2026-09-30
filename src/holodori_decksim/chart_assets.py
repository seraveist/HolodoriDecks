"""Verify current game chart assets independently of removed master hash fields."""
from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

from .master_source import AndroidMaster, request_bytes

ROOT = Path(__file__).resolve().parents[2]
DIFFICULTIES = {1: "EASY", 2: "NORMAL", 3: "HARD", 4: "EXPERT"}
TOOL_COMMIT = "13f150fe9dfbd367be53e5ea1c0a4ceb258b74f2"
PARSER_COMMIT = "292549eaf4ac7b82bd239fcacb719bae6dfa7ad9"
CONVERTER_COMMIT = "100e0ac4e5d2a895089b565f38800d1cc6a0b28e"
CATALOG_URLS = tuple(f"https://{region}.game-hololive-dreams.com/asset/v2/pub/a/5/v/200001/list/{{gen}}"
                    for region in ("us", "jp", "as"))
COUNTS = {"tap": "NORMAL", "flick": "FLICK", "long_start": "LONG_START",
          "long_end": "LONG_END", "long_flick_end": "LONG_FLICK_END",
          "long_relay": "LONG_RELAY", "long_continuation": "LONG_CONTINUE"}


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def verify_resource(raw: bytes, expected_hash: str, expected_size: int) -> None:
    # Octo's historical representation omits zero padding on individual bytes.
    digest = hashlib.md5(raw).digest()
    if expected_hash not in {digest.hex(), "".join(format(b, "x") for b in digest)}:
        raise ValueError("Downloaded chart MD5 mismatch")
    if len(raw) != expected_size:
        raise ValueError("Downloaded chart size mismatch")


def fetch_catalog(fetcher, request_errors):
    """The official regional services expose the same Android asset catalogue.

    GitHub-hosted runners can be denied by an individual regional endpoint.
    Only transport errors try another official service; decode/integrity errors
    remain fatal, and no cached catalogue is substituted for a current response.
    """
    for index, url in enumerate(CATALOG_URLS):
        try:
            result = fetcher(url=url)
        except request_errors as error:
            if index == len(CATALOG_URLS) - 1:
                raise
            print(f"[chart-assets] {urlparse(url).hostname}: {type(error).__name__}; trying next official region", file=sys.stderr)
        else:
            print(f"[chart-assets] catalogue r{result.revisionId} from {urlparse(url).hostname}", file=sys.stderr)
            return result


def headers(raw: bytes, music_id: str, full_combo: int) -> dict:
    values = dict(re.findall(r"^#([A-Z_]+) ([^\r\n]+)", raw.decode("utf-8-sig"), re.M))
    if values.get("MUSIC_ID") != music_id or int(values.get("FULL_COMBO_NOTE_COUNT", -1)) != full_combo:
        raise ValueError(f"SUS/master identity or combo mismatch: {music_id}")
    for name in COUNTS.values():
        value = int(values.get(f"{name}_NOTE_COUNT", -1))
        if value < 0 or value > full_combo:
            raise ValueError(f"Invalid SUS {name} count: {music_id}")
    if sum(int(values[f"{name}_NOTE_COUNT"]) for name in COUNTS.values()) != full_combo:
        raise ValueError(f"SUS category/combo mismatch: {music_id}")
    return values


def validate_timeline(meta: dict, chart: dict, values: dict) -> dict:
    notes = meta.get("notes", [])
    if len(notes) != chart["fullComboNoteCount"]:
        raise ValueError("parser note count differs from verified SUS/master")
    counts = Counter()
    previous = -1
    for kind, time in notes:
        base = kind.removeprefix("critical_")
        if base not in COUNTS or not math.isfinite(time) or time < 0 or time < previous:
            raise ValueError("invalid scoring note or note order")
        counts[base] += 1
        previous = time
    for kind, name in COUNTS.items():
        if counts[kind] != int(values[f"{name}_NOTE_COUNT"]):
            raise ValueError(f"parser {kind} count differs from verified SUS")
    if int(values.get("DAMAGE_NOTE_COUNT", 0)) or int(values.get("GHOST_NOTE_COUNT", 0)):
        raise ValueError("unsupported damage/ghost notes")
    skills = [{"slot": x["skill_slot_no"], "time": x["time"], "combo": x["skill_starts_at_combo"]}
              for x in meta.get("skills", [])]
    if [x["slot"] for x in skills] != [1, 2, 3, 4, 5]:
        raise ValueError("five ordered SP slots are required")
    for i, skill in enumerate(skills):
        if (not math.isfinite(skill["time"]) or skill["time"] < 0
                or not isinstance(skill["combo"], int) or not 0 <= skill["combo"] <= len(notes)
                or (i and (skill["time"] <= skills[i - 1]["time"] or skill["combo"] < skills[i - 1]["combo"]))):
            raise ValueError("invalid SP timeline")
    fever = meta.get("fever")
    if fever and not (math.isfinite(fever["start"]) and math.isfinite(fever["end"]) and 0 <= fever["start"] < fever["end"]):
        raise ValueError("invalid fever window")
    return {"notes": notes, "skills": skills, "fever": fever}


def sync_chart_assets(commit: str, *, root: Path = ROOT) -> bool:
    from holodori_asset_tools import catalog
    from holodori_asset_tools.crypto.resource import decrypt
    from holodori.scores import chart_metadata, load_sus
    from httpx import HTTPError

    generated = root / "data/generated"
    target = generated / "chart-assets.json"
    old = read_json(target, {})
    master = AndroidMaster(commit)
    rows = json.loads(master.table("MusicDifficultyChart.json")[0])
    details = json.loads(master.table("MusicDifficulty.json")[0])
    detail_index = {(x["music_id"], x["difficulty_type"]): x["data"] for x in details}
    # Always refresh the catalogue, including runs where the master is unchanged.
    current = fetch_catalog(catalog.fetch, HTTPError)
    if current.revisionId < old.get("catalogRevision", 0):
        raise ValueError("Asset catalogue revision regressed")
    entries = {x.name: x for x in current.resources}
    runtime = read_json(generated / "exact-runtime-index.json", {}).get("charts", {})
    cache = root / ".local/chart-assets"
    cache.mkdir(parents=True, exist_ok=True)
    pending_metadata = {}

    def resolve(row):
        music_id, difficulty_type = row["music_id"], row["difficulty_type"]
        difficulty = DIFFICULTIES[difficulty_type]
        key = f"{music_id}:{difficulty}"
        asset_id = detail_index[(music_id, difficulty_type)]["chartAssetId"]
        if not re.fullmatch(r"chart_m\d+_(easy|normal|hard|expert)", asset_id):
            raise ValueError(f"Unexpected chart asset ID: {asset_id}")
        entry = entries[asset_id + ".sus"]
        if urlparse(entry.url).hostname != "asset.game-hololive-dreams.com" or not entry.url.startswith("https://"):
            raise ValueError("Untrusted chart asset host")
        if not re.fullmatch(r"[0-9a-f]{1,32}", entry.md5):
            raise ValueError("Invalid asset MD5")
        chart = {"musicId": music_id, "difficulty": difficulty, "chartAssetId": asset_id,
                 "chartHash": entry.md5, "fullComboNoteCount": int(row["data"]["fullComboNoteCount"])}
        encrypted_path = cache / f"{entry.md5}.bin"
        encrypted = encrypted_path.read_bytes() if encrypted_path.exists() else request_bytes(entry.url)
        verify_resource(encrypted, entry.md5, entry.size)
        encrypted_path.write_bytes(encrypted)
        raw = decrypt(encrypted, entry.name)
        values = headers(raw, music_id, chart["fullComboNoteCount"])
        chart.update(normalNoteCount=int(values["NORMAL_NOTE_COUNT"]), susSha256=hashlib.sha256(raw).hexdigest())
        local = read_json(generated / "charts" / f"{music_id}-{difficulty}.json", {})
        previous_runtime = runtime.get(key, {})
        identity = ("musicId", "difficulty", "chartAssetId", "chartHash", "fullComboNoteCount")
        if all(local.get(field) == chart[field] for field in identity) and len(local.get("notes", [])) == chart["fullComboNoteCount"]:
            return key, chart
        if (all(previous_runtime.get(field) == chart[field] for field in identity)
                and previous_runtime.get("normalNoteCount") == chart["normalNoteCount"]):
            return key, chart
        sus_path = cache / f"{entry.md5}.sus"
        sus_path.write_bytes(raw)
        try:
            score, lengths = load_sus(sus_path)
            metadata = validate_timeline(chart_metadata(score, lengths), chart, values)
        except (ValueError, AssertionError, KeyError, IndexError, ZeroDivisionError) as exc:
            chart["timelineUnavailable"] = f"{type(exc).__name__}: {exc}"
        else:
            pending_metadata[key] = {"version": 1, **chart, "sourceFile": entry.name,
                                     "parserCommit": PARSER_COMMIT, "converterCommit": CONVERTER_COMMIT, **metadata}
        return key, chart

    with ThreadPoolExecutor(max_workers=8) as pool:
        charts = dict(sorted(pool.map(resolve, rows)))
    payload = {"version": 1, "source_commit": commit, "master_version": master.version,
               "catalogRevision": current.revisionId, "assetToolCommit": TOOL_COMMIT, "charts": charts}
    # Publish only after every asset's hash, header and master relationship passed.
    changed = payload != old or bool(pending_metadata)
    (generated / "charts").mkdir(exist_ok=True)
    for key, metadata in sorted(pending_metadata.items()):
        (generated / "charts" / f"{key.replace(':', '-')}.json").write_text(
            json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed
