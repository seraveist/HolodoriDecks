"""Source-scoped repair for overlapping long ends sharing one flick marker.

The pinned upstream parser is unchanged. Only five audited PR #93 SUS hashes
are eligible; every repaired timeline still passes the original validator.
"""
import hashlib
from collections import defaultdict
from copy import deepcopy

ADAPTER_VERSION = "pr93-single-flick-end-v1"
VERIFIED_SOURCES = {
    "m0388:HARD": "5b164dd572cf42d72a0281d3894cbee42bfc632df24339ee704b963021665a99",
    "m0388:EXPERT": "ed8bcdb1a26186b3d5cc54a8d09481b35139192ccc7fd09b5e14d597c19687f9",
    "m0549:HARD": "72ae9a37765f72709ffe4b3cae202c410748b637c4ee3d608f2b4d9288c9789c",
    "m0549:EXPERT": "9816bc7cbe4fa7646f1e8fd595bdf314389b82a0aef613996102ec963cd16557",
    "m0551:EXPERT": "f40637f62fe12bc91f3d30a357547a37c7d5b4db1849d700974f4eec461ee317",
}


def repair_verified_chart(score, raw, bar_lengths, chart):
    key = f"{chart['musicId']}:{chart['difficulty']}"
    if VERIFIED_SOURCES.get(key) != hashlib.sha256(raw).hexdigest():
        return score, []
    return repair_overlapping_flick_ends(score, raw.decode("utf-8-sig"), bar_lengths)


def repair_overlapping_flick_ends(score, text, bar_lengths):
    from sonolus_converters.holodori_sus.loader import _holodori_notes
    from sonolus_converters.sus.loader import _get_bars, TICKS_PER_BEAT
    from sonolus_converters.notes.slide import Slide, SlideEndPoint

    bars = _get_bars(bar_lengths or [(0, 4.0)], TICKS_PER_BEAT)
    markers = defaultdict(list)
    for raw in text.splitlines():
        line = raw.strip()
        colon = line.find(":", 1)
        if not line.startswith("#") or colon < 0:
            continue
        header = line[1:colon].strip()
        if len(header) != 5 or not header[:3].isdigit() or header[3] != "5":
            continue
        for note in _holodori_notes(header, header[4], line[colon + 1:].strip(), bars, int(header[:3]), 0):
            if note.type in (1, 3, 4):
                markers[(note.tick, note.lane)].append(note)

    result = deepcopy(score)
    ends = defaultdict(list)
    for note in result.notes:
        if isinstance(note, Slide):
            for conn in note.connections:
                if isinstance(conn, SlideEndPoint):
                    key = (round(conn.beat * TICKS_PER_BEAT), round(conn.lane - conn.size + 8))
                    ends[key].append(conn)
    changes = []
    for key, group in ends.items():
        if len(group) < 2 or not markers[key]:
            continue
        if len(markers[key]) != 1:
            continue  # no candidate repair without an unambiguous single marker
        marker = markers[key][0]
        matching = [end for end in group if round(end.size * 2) == marker.width]
        if not matching:
            continue  # no candidate repair without a width-matched endpoint
        selected = matching[0]  # stable original parser order for identical ends
        for end in group:
            end.direction = {1: "up", 3: "left", 4: "right"}[marker.type] if end is selected else None
        changes.append({"tick": key[0], "lane": key[1], "markerWidth": marker.width,
                        "overlappingEnds": len(group), "reclassifiedEnds": len(group) - 1})
    return result, changes
