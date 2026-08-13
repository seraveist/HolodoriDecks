# Exact chart corpus compatibility audit

This document records the compatibility audit and v1.1.0 runtime intake design for the public Exact chart-timeline source used by Holodori DeckSim. The third-party chart corpus is **not** bulk-redistributed by this repository.

## Pinned source

- repository: `asciisyaez/yagoo-dori`
- commit: `6c2c95d52c268862d34fb523d965f09a3108bbbd`
- path: `data/generated/holodori-chart-timelines.json`
- SHA-256: `0c34e934a20e29e5ded8140ab31d12617f832ed723d2b56e535d3db19c276534`
- source id: `holodori-best-chart-corpus-r51`
- API revision: `51`
- source retrieval date: `2026-08-02`
- source manifest license field: `null`

The parser reference recorded in that source is `HolodoriDB/holodori-scores`. Its parser code being MIT-licensed does not establish redistribution terms for the generated game-derived timeline corpus.

For that reason DeckSim does not publish 703 converted chart JSON files. v1.1.0 includes only `data/generated/exact-runtime-index.json`, which stores range and integrity metadata and does not contain the full note timelines.

## Audited DeckSim snapshot

- core source commit: `fee804a5a89a6564a38bd5f8dc0d0b48912e0016`
- master version: `879558f477b498cee415f23b1013af1bf72bf5e1d8468cc6022beecad57240c5`
- songs: `182`
- difficulty charts: `728`
- Local Exact metadata: `1` (`m0049 / EXPERT`)

## Compatibility result

The pinned source snapshot declares:

- songs with Exact timelines: `176`
- available Exact charts: `703`
- unavailable charts: `25`
- timed note events: `405,623`
- Special markers: `3,515` (`703 × 5`)

All 703 available charts matched the audited DeckSim Master on:

- `musicId + difficulty`
- `chartHash`
- `fullComboNoteCount`
- `chartAssetId`
- `normalNoteCount`
- parsed event count
- five chronological Special markers
- supported note-type codes

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

DeckSim does not attempt to bypass source access controls. These charts remain on the Master fallback path unless a valid Exact source becomes available.

## Runtime range index

`scripts/build-exact-runtime-index.mjs` builds the current-Master range index from the exact pinned source file.

For each compatible chart the index stores only:

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
Local Exact exists
→ use Local Exact

otherwise compatible Runtime Exact entry exists
→ request bytes=start-end from the pinned public snapshot
→ require HTTP 206
→ require matching Content-Range
→ verify returned byte length
→ require and verify per-object SHA-256
→ parse the source chart object
→ re-check current Master identifiers and five SP markers
→ convert in memory to DeckSim metadata
→ use Exact timeline scoring/order optimization

any failure
→ Master chart fallback
```

A representative `m0049 / EXPERT` range is about `49.7 KB`; the browser does not download the full source corpus at application startup.

The pinned GitHub Raw source was verified with browser-style Range semantics:

- `206 Partial Content`
- `Content-Range`
- `Access-Control-Allow-Origin: *`
- no response content-encoding on the tested Range request

## Current-Master coherence

The range index records the Master source commit and chart count it was built against. v1.1.0 regression tests require:

```text
runtime.currentMasterSourceCommit == chart-index.source_commit
runtime.currentMasterChartCount   == chart-index.chart_count
```

Every runtime entry is also rechecked against its current Master chart.

`.github/workflows/sync-master-data.yml` rebuilds the Runtime Exact index whenever upstream Master data changes. If the pinned source no longer matches some new/changed charts, those entries are omitted and the application uses Master fallback for them.

## m0049 parser parity

The existing Local Exact `m0049 / EXPERT` direct fixture was compared with the same chart converted from the runtime corpus.

Both contain 720 notes and identical:

- five Special slot times and starting combo counts
- Fever start/end
- chart hash
- full-combo count

Strict JSON note-array ordering is not identical because of simultaneous-note ordering and one timestamp differs by at most `1 µs`. For the current scoring kernel:

```text
Manual kernel delta   0
AUTO kernel delta     0
```

The Local Exact file therefore remains preferred for this chart.

## Payload impact

A full materialized conversion was tested in a temporary Actions workspace only:

- compatible Exact files: `703`
- newly generated compact JSON bytes: `10,223,421`
- materialized directory size: about `10.26 MB`

Those files are not committed. The checked-in range index is roughly `0.28 MB` and loads one chart object on demand.

## Exact order benchmark

The five highest-note audited charts were tested with 10 shortlisted compositions × all `5!` member orders = `1,200` order evaluations on a GitHub-hosted Ubuntu runner.

```text
m0321:EXPERT   2,022 notes   2,295.2 ms
m0300:EXPERT   1,777 notes   1,967.6 ms
m0303:EXPERT   1,520 notes   1,709.7 ms
m0136:EXPERT   1,421 notes   1,619.3 ms
m0028:EXPERT   1,404 notes   1,685.5 ms
```

v1.1.0 also expands the 1st-stage Exact shortlist beyond the legacy fixed TOP 10 and includes a small-pool regression that compares the staged optimizer with a complete `all compositions × 120 permutations` search.

## Tooling

Read-only compatibility/materialization audit:

```bash
node scripts/import-chart-timeline-corpus.mjs \
  --input /path/to/holodori-chart-timelines.json \
  --report /tmp/exact-corpus-report.json
```

Runtime index rebuild:

```bash
node scripts/build-exact-runtime-index.mjs \
  --input /path/to/holodori-chart-timelines.json
node scripts/test-exact-runtime-source.mjs
```

`--strict` may be used when an audit should fail if any source-available chart is rejected. Normal Master sync uses the non-strict mode so a changed Master can safely reduce Runtime Exact coverage instead of failing the whole data sync.
