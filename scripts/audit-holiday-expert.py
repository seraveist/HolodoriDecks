from base64 import b64encode
from copy import deepcopy
from hashlib import sha256
from io import StringIO
import json
import zlib
from pathlib import Path
from urllib.parse import urlparse
from httpx import HTTPError
from holodori_asset_tools import catalog
from holodori_asset_tools.crypto.resource import decrypt
from holodori.scores import chart_metadata, load_sus
from holodori_decksim.chart_assets import CONVERTER_COMMIT, PARSER_COMMIT, fetch_catalog, headers, validate_timeline, verify_resource
from holodori_decksim.chart_parser import repair_overlapping_flick_ends
from holodori_decksim.master_source import request_bytes

keys = ("m0408:EXPERT",)
provenance = json.loads(Path("data/generated/chart-assets.json").read_text())["charts"]
entries = {entry.name: entry for entry in fetch_catalog(catalog.fetch, HTTPError).resources}
for key in keys:
    chart = deepcopy(provenance[key])
    chart.pop("timelineUnavailable", None)
    entry = entries[chart["chartAssetId"] + ".sus"]
    assert entry.md5 == chart["chartHash"]
    assert urlparse(entry.url).scheme == "https" and urlparse(entry.url).hostname == "asset.game-hololive-dreams.com"
    encrypted = request_bytes(entry.url)
    verify_resource(encrypted, entry.md5, entry.size)
    raw = decrypt(encrypted, entry.name)
    assert sha256(raw).hexdigest() == chart["susSha256"]
    values = headers(raw, chart["musicId"], chart["fullComboNoteCount"])
    assert int(values["NORMAL_NOTE_COUNT"]) == chart["normalNoteCount"]
    score, lengths = load_sus(StringIO(raw.decode("utf-8-sig")))
    original = chart_metadata(score, lengths)
    corrected, repairs = repair_overlapping_flick_ends(score, raw.decode("utf-8-sig"), lengths)
    parsed = chart_metadata(corrected, lengths)
    assert original["skills"] == parsed["skills"] and original["fever"] == parsed["fever"]
    assert len(original["notes"]) == len(parsed["notes"])
    for before, after in zip(original["notes"], parsed["notes"]):
        assert before[1] == after[1]
        if before[0] != after[0]:
            assert before[0].removeprefix("critical_") == "long_flick_end"
            assert after[0].removeprefix("critical_") == "long_end"
            assert before[0].startswith("critical_") == after[0].startswith("critical_")
    print("CHART_AUDIT", key, json.dumps({"repairs": repairs, "ghost": values.get("GHOST_NOTE_COUNT", "0"),
          "damage": values.get("DAMAGE_NOTE_COUNT", "0"), "sp": parsed["skills"], "rawSha256": sha256(raw).hexdigest(),
          "ghostHeaders": sorted(k for k in values if "GHOST" in k)}))
    guides = [note for note in score.notes if type(note).__name__ == "Guide"]
    assert int(values["GHOST_NOTE_COUNT"]) == 48
    assert int(values.get("DAMAGE_NOTE_COUNT", 0)) == 0
    assert guides
    score.notes[:] = [note for note in score.notes if type(note).__name__ != "Guide"]
    without_guides = chart_metadata(score, lengths)
    assert all(parsed[field] == without_guides[field] for field in ("notes", "skills", "fever"))
    print("VISUAL_ONLY", key, len(guides), len(parsed["notes"]))
    try:
        metadata = validate_timeline(parsed, chart, {**values, "GHOST_NOTE_COUNT": "0"})
    except ValueError as error:
        print("CHART_REJECTED", key, str(error))
        continue
    payload = {"version": 1, **chart, "sourceFile": entry.name, "parserCommit": PARSER_COMMIT,
               "converterCommit": CONVERTER_COMMIT, **metadata}
    if repairs:
        payload["parserAdapter"] = {"version": "pr93-single-flick-end-v1", "sourceSusSha256": chart["susSha256"],
                                    "reclassifiedEnds": sum(r["reclassifiedEnds"] for r in repairs)}
    blob = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    print("CHART_METADATA", key, sha256(blob).hexdigest(), b64encode(zlib.compress(blob)).decode())
