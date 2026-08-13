# Exact chart corpus compatibility audit

This document records the compatibility audit for a candidate bulk Exact chart-timeline source. It does **not** mean that the third-party corpus is redistributed by Holodori DeckSim.

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

The candidate project describes the source as build-time data. The parser reference recorded in that source is `HolodoriDB/holodori-scores`, whose parser code is MIT-licensed; this does not by itself establish redistribution terms for the generated chart corpus or game-derived chart data.

Because the candidate corpus does not currently state redistribution terms, Holodori DeckSim does not bulk-publish the converted 703-chart dataset. The importer and audit remain ready so that production intake can proceed once the data-use terms are documented.

## DeckSim snapshot audited

The audit was run against the v1.0.0-era generated Master currently used by DeckSim:

- core source commit: `fee804a5a89a6564a38bd5f8dc0d0b48912e0016`
- master version: `879558f477b498cee415f23b1013af1bf72bf5e1d8468cc6022beecad57240c5`
- songs: `182`
- difficulty charts: `728`
- Exact metadata already committed before the audit: `1` (`m0049 / EXPERT`)

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
usable Exact charts          703
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

The importer therefore reports both strict parser equality and semantic scoring parity, and preserves an already committed per-chart Exact file by default instead of overwriting it.

## Payload impact

The production-format conversion was exercised in a temporary Actions workspace only.

- new compact per-chart files: `702`
- existing `m0049 / EXPERT` preserved: `1`
- resulting Exact files: `703`
- newly generated compact JSON bytes: `10,223,421`
- total `data/generated/charts/` bytes including the existing fixture: about `10.26 MB`

Files are lazy-loaded per selected chart, so the whole corpus would not be downloaded by the browser on page startup.

## Worst-case order-search benchmark

A synthetic five-member deck was evaluated on the five highest-note Exact charts. Each benchmark used 10 shortlisted compositions × all `5!` member orders = `1,200` exact order evaluations on a GitHub-hosted Ubuntu runner.

```text
m0321:EXPERT   2,022 notes   2,295.2 ms
m0300:EXPERT   1,777 notes   1,967.6 ms
m0303:EXPERT   1,520 notes   1,709.7 ms
m0136:EXPERT   1,421 notes   1,619.3 ms
m0028:EXPERT   1,404 notes   1,685.5 ms
```

This is a synthetic CI benchmark rather than a browser SLA, but it confirms that the current staged optimizer remains practical even on the densest candidate timelines.

## Importer

`scripts/import-chart-timeline-corpus.mjs` performs a read-only audit by default and verifies the pinned source SHA before parsing.

Example after obtaining the exact pinned input file:

```bash
node scripts/import-chart-timeline-corpus.mjs \
  --input /path/to/holodori-chart-timelines.json \
  --report /tmp/exact-corpus-report.json
```

To materialize compatible per-chart files locally:

```bash
node scripts/import-chart-timeline-corpus.mjs \
  --input /path/to/holodori-chart-timelines.json \
  --write
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
node scripts/test-chart-scoring.mjs
```

Existing Exact files are preserved unless `--overwrite` is explicitly provided.
