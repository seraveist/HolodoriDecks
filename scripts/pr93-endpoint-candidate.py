"""Investigation-only candidate: a single flick marker cannot label two ends.

This module is not wired into Exact generation. It never reads header counts to
choose a classification. Ambiguous groups retain the original parse.
"""
from collections import defaultdict
from copy import deepcopy


def candidate_score(score, text, bar_lengths):
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
