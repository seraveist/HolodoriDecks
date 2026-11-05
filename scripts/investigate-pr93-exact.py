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
from holodori_decksim.chart_parser import repair_verified_chart, VERIFIED_SOURCES

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("chart_audit", HERE / "audit-chart-timelines.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
candidate_spec = importlib.util.spec_from_file_location("endpoint_candidate", HERE / "pr93-endpoint-candidate.py")
candidate = importlib.util.module_from_spec(candidate_spec)
candidate_spec.loader.exec_module(candidate)


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


def trial_candidate(raw, chart, *, scoped=False):
    from holodori.scores import chart_metadata, load_sus
    text = raw.decode("utf-8-sig")
    score, lengths = load_sus(StringIO(text))
    original = chart_metadata(score, lengths)
    corrected, changes = (repair_verified_chart(score, raw, lengths, chart) if scoped
                          else candidate.candidate_score(score, text, lengths))
    meta = chart_metadata(corrected, lengths)
    original_notes, notes = original["notes"], meta["notes"]
    if len(notes) != len(original_notes) or original["skills"] != meta["skills"] or original["fever"] != meta["fever"]:
        raise ValueError("Candidate changed total notes, SP, or Fever")
    end_types = {"long_end", "long_flick_end"}
    for before, after in zip(original_notes, notes):
        if before[1] != after[1]:
            raise ValueError("Candidate changed a note timestamp")
        if before[0] != after[0] and not (
            before[0].removeprefix("critical_") in end_types
            and after[0].removeprefix("critical_") in end_types
            and before[0].startswith("critical_") == after[0].startswith("critical_")
        ):
            raise ValueError("Candidate changed a non-end event or critical state")
    result = audit.audit_raw(raw, chart, parser=lambda data: meta)
    # Counts and markers, but no full scoring timeline, leave the runner.
    result.update(changes=changes, timestampsSpFeverAndCriticalStateUnchanged=True)
    return result


def regression_corpus(assets, entries, master_rows, detail_rows, difficulties, decrypt, raw_cache):
    from concurrent.futures import ThreadPoolExecutor

    def verify(item):
        key, chart = item
        identity = (chart["musicId"], difficulties[chart["difficulty"]])
        if (master_rows[identity]["data"]["fullComboNoteCount"] != chart["fullComboNoteCount"]
                or detail_rows[identity]["data"]["chartAssetId"] != chart["chartAssetId"]):
            raise ValueError(f"Master/asset mismatch: {key}")
        raw = raw_cache.get(key)
        if raw is None:
            raw = verified_source(entries[chart["chartAssetId"] + ".sus"], chart, download=request_bytes, decrypt=decrypt)
        return key, raw

    with ThreadPoolExecutor(max_workers=8) as pool:
        sources = dict(pool.map(verify, assets["charts"].items()))
    result = {"verifiedSources": len(sources), "baselinePasses": 0, "candidatePasses": 0,
              "scopedCandidatePasses": 0, "scopedChangedCharts": {},
              "regressions": [], "changedCharts": {}, "candidateErrors": {}}
    for key, raw in sorted(sources.items()):
        chart = assets["charts"][key]
        try:
            baseline = audit.audit_raw(raw, chart)
        except Exception as error:
            baseline = {"status": "parser-error", "error": f"{type(error).__name__}: {error}"}
        passed = baseline["status"] == "passed-existing-validator"
        result["baselinePasses"] += int(passed)
        scoped = (trial_candidate(raw, chart, scoped=True) if key in VERIFIED_SOURCES else baseline)
        result["scopedCandidatePasses"] += int(scoped["status"] == "passed-existing-validator")
        if scoped.get("changes"):
            result["scopedChangedCharts"][key] = {"status": scoped["status"], "changes": scoped["changes"]}
        if passed and scoped["status"] != "passed-existing-validator":
            result["regressions"].append(key)
        try:
            trial = trial_candidate(raw, chart)
        except Exception as error:
            result["candidateErrors"][key] = f"{type(error).__name__}: {error}"
            if passed:
                result["regressions"].append(key)
            continue
        candidate_passed = trial["status"] == "passed-existing-validator"
        result["candidatePasses"] += int(candidate_passed)
        if passed and not candidate_passed:
            result["regressions"].append(key)
        if trial["changes"]:
            result["changedCharts"][key] = {"baselineStatus": baseline["status"], "candidateStatus": trial["status"],
                                           "changes": trial["changes"], "specialNoteCounts": trial["specialNoteCounts"]}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--regression-corpus", action="store_true", help="Verify all current original SUS files and compare candidate acceptance")
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
        raw_cache = {}
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
                raw_cache[key] = raw
                meta, trace = traced_parse(raw)
                result = audit.audit_raw(raw, chart, parser=lambda data: meta)
                result.update(officialMd5AndSizeVerified=True, sourceSize=entry.size,
                              independentSpFeverChecks=sp_checks(meta), parserTrace=trace)
                result["candidate"] = trial_candidate(raw, chart)
                result["scopedRepair"] = trial_candidate(raw, chart, scoped=True)
                report["charts"][key].update(result)
                print(json.dumps({"key": key, **{k: result[k] for k in ("status", "categoryCounts", "specialNoteCounts", "independentSpFeverChecks")}}, ensure_ascii=False))
            except Exception as error:
                report["charts"][key].update(status="source-or-parser-error", error=f"{type(error).__name__}: {error}")
        report["complete"] = all("officialMd5AndSizeVerified" in row for row in report["charts"].values())
        if args.regression_corpus:
            report["regressionCorpus"] = regression_corpus(assets, entries, master_rows, detail_rows, difficulties, decrypt, raw_cache)
            report["complete"] = report["complete"] and not report["regressionCorpus"]["regressions"]
    except Exception as error:
        report["fatalError"] = f"{type(error).__name__}: {error}"
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
