"""Read-only official-source investigation. No Exact or generated-data writes."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
from io import StringIO
import json
import math
from pathlib import Path
import re
from unittest.mock import patch
from urllib.parse import urlparse

from holodori_decksim.chart_assets import fetch_catalog, headers, verify_resource
from holodori_decksim.master_source import AndroidMaster, request_bytes

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("chart_audit", HERE / "audit-chart-timelines.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def verified_source(entry, chart, *, download, decrypt):
    if entry.name != chart["chartAssetId"] + ".sus":
        raise ValueError("Chart asset name mismatch")
    if urlparse(entry.url).hostname != "asset.game-hololive-dreams.com" or not entry.url.startswith("https://"):
        raise ValueError("Untrusted chart asset host")
    if not re.fullmatch(r"[0-9a-f]{1,32}", entry.md5) or entry.md5 != chart["chartHash"]:
        raise ValueError("Official chart identity changed since PR #93; refusing substitution")
    encrypted = download(entry.url)
    verify_resource(encrypted, entry.md5, entry.size)
    raw = decrypt(encrypted, entry.name)
    if hashlib.sha256(raw).hexdigest() != chart["susSha256"]:
        raise ValueError("Decrypted SUS SHA-256 differs from PR #93")
    headers(raw, chart["musicId"], chart["fullComboNoteCount"])
    return raw


def sp_checks(meta):
    skills = meta.get("skills", [])
    errors = []
    if [s["skill_slot_no"] for s in skills] != [1, 2, 3, 4, 5]:
        errors.append("five ordered SP slots are required")
    for i, skill in enumerate(skills):
        t, combo = skill["time"], skill["skill_starts_at_combo"]
        if (not math.isfinite(t) or t < 0 or not isinstance(combo, int)
                or not 0 <= combo <= len(meta["notes"])
                or (i and (t <= skills[i - 1]["time"] or combo < skills[i - 1]["skill_starts_at_combo"]))):
            errors.append(f"invalid SP slot {skill['skill_slot_no']}")
    fever = meta.get("fever")
    if fever and not (math.isfinite(fever["start"]) and math.isfinite(fever["end"])
                      and 0 <= fever["start"] < fever["end"]):
        errors.append("invalid fever window")
    return {"errors": errors, "passed": not errors,
            "scope": "independent checks of existing SP/Fever rules; cannot approve a rejected chart"}


def traced_parse(raw):
    from holodori.scores import chart_metadata, load_sus
    import sonolus_converters.holodori_sus.loader as loader
    from sonolus_converters.notes.slide import Slide, SlideEndPoint

    captured = {}
    raw_long_counts = Counter()
    original_convert = loader._holodori_to_score
    original_notes = loader._holodori_notes

    def note_trace(header, lane_char, data, bars, measure, til):
        notes = original_notes(header, lane_char, data, bars, measure, til)
        if len(header) == 6 and header[3] == "3":
            raw_long_counts.update(str(n.type) for n in notes)
        return notes

    def conversion_trace(*args, **kwargs):
        taps, directionals, slides, ghosts = args[:4]
        result = original_convert(*args, **kwargs)
        end_direction = {}
        for note in result[0].notes:
            if isinstance(note, Slide):
                for end in note.connections:
                    if isinstance(end, SlideEndPoint):
                        key = (round(end.beat * 480), round(end.lane - end.size + 8))
                        end_direction[key] = end.direction
        endpoints = []
        for hold in slides:
            end = hold[-1]
            nearby = [d for d in directionals if d.tick == end.tick and d.lane == end.lane]
            overlays = [t for t in taps if t.tick == end.tick and t.lane == end.lane]
            endpoints.append({
                "tick": end.tick, "lane": end.lane, "width": end.width,
                "startTick": hold[0].tick, "startLane": hold[0].lane,
                "direction": end_direction.get((end.tick, end.lane)),
                "directionalMarkers": [{"kind": d.type, "width": d.width} for d in nearby],
                "tapMarkers": [{"kind": t.type, "width": t.width} for t in overlays],
            })
        groups = Counter(
            f"direction={e['direction']};markers={','.join(str(d['kind']) for d in e['directionalMarkers']) or 'none'}"
            for e in endpoints
        )
        captured.update(
            rawTapKinds=dict(sorted(Counter(str(t.type) for t in taps).items())),
            rawDirectionalKinds=dict(sorted(Counter(str(d.type) for d in directionals).items())),
            pairedSlides=len(slides), ghostStreams=len(ghosts),
            endGroups=dict(sorted(groups.items())), endpoints=endpoints,
            rawSpPoints=args[6], rawFeverPoints=args[7],
        )
        return result

    with patch.object(loader, "_holodori_notes", note_trace), patch.object(loader, "_holodori_to_score", conversion_trace):
        meta = chart_metadata(*load_sus(StringIO(raw.decode("utf-8-sig"))))
    # Tracing must never alter what the pinned parser produces.
    if meta != audit.parse_sus(raw):
        raise ValueError("Tracing changed the pinned parser output")
    captured["rawLongKindsBeforePairing"] = dict(sorted(raw_long_counts.items()))
    return meta, captured


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {"mode": "live-read-only-investigation", "complete": False,
              "generatedDataWrites": False, "exactRegistrations": False, "charts": {}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        from holodori_asset_tools import catalog
        from holodori_asset_tools.crypto.resource import decrypt
        from httpx import HTTPError

        report["installedToolCommits"] = audit.require_pinned_toolchain()
        assets = json.loads(Path("data/generated/chart-assets.json").read_text())
        report.update(source_commit=assets["source_commit"], master_version=assets["master_version"],
                      committedCatalogRevision=assets["catalogRevision"])
        master = AndroidMaster(assets["source_commit"])
        if master.version != assets["master_version"]:
            raise ValueError("Master version mismatch")
        rows = json.loads(master.table("MusicDifficultyChart.json")[0])
        details = json.loads(master.table("MusicDifficulty.json")[0])
        master_rows = {(r["music_id"], r["difficulty_type"]): r for r in rows}
        detail_rows = {(r["music_id"], r["difficulty_type"]): r for r in details}
        current = fetch_catalog(catalog.fetch, HTTPError)
        if current.revisionId < assets["catalogRevision"]:
            raise ValueError("Official catalogue revision regressed")
        report["verifiedCatalogRevision"] = current.revisionId
        entries = {e.name: e for e in current.resources}
        difficulties = {"EASY": 1, "NORMAL": 2, "HARD": 3, "EXPERT": 4}
        for key in audit.TARGETS:
            chart = assets["charts"][key]
            report["charts"][key] = {"status": "not-yet-verified", "chartHash": chart["chartHash"], "susSha256": chart["susSha256"]}
            try:
                identity = (chart["musicId"], difficulties[chart["difficulty"]])
                if master_rows[identity]["data"]["fullComboNoteCount"] != chart["fullComboNoteCount"]:
                    raise ValueError("Master full-combo count mismatch")
                if detail_rows[identity]["data"]["chartAssetId"] != chart["chartAssetId"]:
                    raise ValueError("Master asset identity mismatch")
                entry = entries[chart["chartAssetId"] + ".sus"]
                raw = verified_source(entry, chart, download=request_bytes, decrypt=decrypt)
                meta, trace = traced_parse(raw)
                result = audit.audit_raw(raw, chart, parser=lambda data: meta)
                result.update(officialMd5AndSizeVerified=True, sourceSize=entry.size,
                              independentSpFeverChecks=sp_checks(meta), parserTrace=trace)
                report["charts"][key].update(result)
                print(json.dumps({"key": key, **{k: result[k] for k in ("status", "categoryCounts", "specialNoteCounts", "independentSpFeverChecks")}}, ensure_ascii=False))
            except Exception as error:
                report["charts"][key].update(status="source-or-parser-error", error=f"{type(error).__name__}: {error}")
        report["complete"] = all("officialMd5AndSizeVerified" in row for row in report["charts"].values())
    except Exception as error:
        report["fatalError"] = f"{type(error).__name__}: {error}"
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
