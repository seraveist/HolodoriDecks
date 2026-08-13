# Exact chart corpus compatibility audit

This document records the compatibility audit and release-candidate runtime intake design for a candidate bulk Exact chart-timeline source. The third-party 703-chart corpus is **not** bulk-redistributed by Holodori DeckSim.

## Candidate source

Pinned public generated snapshot:

- repository: `asciisyaez/yagoo-dori`
- commit: `6c2c95d52c268862d34fb523d965f09a3108bbbd`
- path: `data/generated/holodori-chart-timelines.json`
- SHA-256: `0c34e934a20e29e5ded8140ab31d12617f832ed723d2b56e535d3db19c276534`
- source id: `holodori-best-chart-corpus-r51`
- API revision: `51`
- source retrieval date: `2026-08-02`
- source manifest license field: `null`

The parser reference recorded in that source is `HolodoriDB/holodori-scores`, whose parser code is MIT-licensed. That does not by itself establish redistribution terms for the generated chart corpus or game-derived chart data.

Because the candidate corpus does not currently state redistribution terms, Holodori DeckSim does not publish 703 converted chart JSON files in this repository. The current release candidate instead contains only a compact **runtime range index** derived from the pinned public snapshot. The index stores byte offsets, lengths, per-object SHA-256 values, and current-Master identifiers; it does not contain the note timelines themselves.

## DeckSim snapshot audited

The audit was run against the generated Master currently used by DeckSim:

- core source commit: `fee804a5a89a6564a38bd5f8dc0d0b48912e0016`
- master version: `879558f477b498cee415f23b1013af1bf72bf5e1d8468cc6022beecad57240c5`
- songs: `182`
- difficulty charts: `728`
- Local Exact metadata already committed: `1` (`m0049 / EXPERT`)

## Compatibility result

The pinned corpus declares:

- songs with Exact timelines: `176`
- available Exact charts: `703`
- unavailable charts: `25`
- timed note events: `405,623`
- Special markers: `3,515` (`703 × 5`)

All 703 available charts matched the current DeckSim Master on the required safety keys:

- `musicId + difficulty`
- `chartHash`
- `fullComboNoteCount`
- `chartAssetId`
- `normalNoteCount`
- parsed event count
- five chronological Special markers
- supported note-type codes

Audit result:

```text
current Master charts        728
usable Runtime Exact charts  703
rejected available charts      0
missing corpus keys             0
unavailable charts             25
stale imported charts           0
damage events                   0
critical events            63,900
```

Unavailable reasons recorded by the source snapshot:

```text
21  source-api-unreachable-cloudflare-challenge-at-intake
 4  source-chart-does-not-contain-five-special-markers
```

No attempt is made to bypass source access controls. These 25 charts remain on DeckSim's existing Master/fallback path unless an independently valid Exact source becomes available.

## Runtime range index

The release candidate's `data/generated/exact-runtime-index.json` is generated from the exact pinned snapshot by `scripts/build-exact-runtime-index.mjs`.

For every compatible chart it records only:

```text
byte start / end / length
per-object SHA-256
musicId / difficulty
chartHash
chartAssetId
fullComboNoteCount
normalNoteCount
```

At runtime:

```text
Local Exact file exists
→ use Local Exact

otherwise Runtime Exact range exists
→ request only bytes=start-end from the pinned raw GitHub snapshot
→ require HTTP 206 and exact Content-Range
→ verify returned byte length
→ verify per-object SHA-256
→ parse source chart object
→ re-check musicId/difficulty/chartHash/note counts/5 SP markers
→ convert in memory to DeckSim metadata
→ use exact timeline scoring/order optimization

any failure
→ return to Master chart fallback
```

The browser does not download the 28.4 MB corpus during app startup. It loads the small runtime index once and only the selected chart object on demand. A representative `m0049 / EXPERT` range is about `49.7 KB`.

The pinned GitHub Raw source was verified to support browser-style `fetch()` with:

- `206 Partial Content`
- `Content-Range`
- `Access-Control-Allow-Origin: *`
- no response content-encoding on the tested Range request

The loader remains fail-soft: network/CORS/Range/source failures never prevent a Master-only score calculation.

## m0049 parser parity

The already committed `m0049 / EXPERT` direct fixture was compared with the same chart converted from the bulk corpus.

Both contain 720 notes and identical:

- five Special slot times and starting combo counts
- Fever start/end
- chart hash
- full-combo count

Strict JSON note-array ordering is not identical:

- 45 sequence positions differ
- 44 are type/order differences among simultaneous notes
- 1 timestamp differs by at most `1 µs`

The DeckSim scoring kernel is nevertheless exactly equivalent for the current rules:

```text
Manual kernel delta   0
AUTO kernel delta     0
```

The Local Exact `m0049 / EXPERT` file therefore remains the preferred source, while the runtime converter is regression-tested against it for semantic parity.

## Payload impact

A full materialized conversion was exercised only in a temporary Actions workspace:

- new compact per-chart files: `702`
- existing `m0049 / EXPERT` preserved: `1`
- resulting Exact files: `703`
- newly generated compact JSON bytes: `10,223,421`
- total materialized `data/generated/charts/` size: about `10.26 MB`

Those 702 derived files are not committed. The release candidate instead adds `exact-runtime-index.json` at roughly 0.28 MB and lazy-loads one source object at a time.

## Worst-case order-search benchmark

A synthetic five-member deck was evaluated on the five highest-note Exact charts. Each benchmark used 10 shortlisted compositions × all `5!` member orders = `1,200` exact order evaluations on a GitHub-hosted Ubuntu runner.

```text
m0321:EXPERT   2,022 notes   2,295.2 ms
m0300:EXPERT   1,777 notes   1,967.6 ms
m0303:EXPERT   1,520 notes   1,709.7 ms
m0136:EXPERT   1,421 notes   1,619.3 ms
m0028:EXPERT   1,404 notes   1,685.5 ms
```

This is a synthetic CI benchmark rather than a browser SLA, but it confirms that the staged optimizer remains practical even on the densest audited timelines.

## Tooling

### Compatibility/materialization importer

`scripts/import-chart-timeline-corpus.mjs` verifies the pinned source SHA and performs the full compatibility audit. By default it is read-only.

```bash
node scripts/import-chart-timeline-corpus.mjs \
  --input /path/to/holodori-chart-timelines.json \
  --report /tmp/exact-corpus-report.json
```

Its `--write` mode exists for local testing but is not the production redistribution mechanism.

### Runtime index builder

```bash
node scripts/build-exact-runtime-index.mjs \
  --input /path/to/holodori-chart-timelines.json
node scripts/test-exact-runtime-source.mjs
```

The builder refuses an input whose full SHA-256 does not match the pinned snapshot and refuses/rejects chart objects that do not match the current Master safety keys.

## Source/data-use boundary

The external snapshot remains hosted by its source repository. DeckSim's release candidate publishes only the compatibility/range metadata required to request a selected public object and validates that object before use. This design intentionally avoids adding 703 third-party-derived note-timeline files to the DeckSim repository while retaining fail-soft Exact scoring for compatible charts.

The runtime intake remains a release candidate until the branch's full CI and manual browser checks are completed and the change is deliberately merged/released.
