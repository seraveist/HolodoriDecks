# Master-backed member boards (pre-scoring foundation)

The `feature/member-board-ui` branch keeps the existing third-tab UI and replaces
its shared reference fixture with a version-aligned Master catalog. **No board or
memory profile is passed to the scoring/optimization engine.** Main deployment,
release version, and score formulas are unchanged.

## Included

- Real member-to-layout links, original coordinates, resolved per-character node
  variants, effects, targets, conditions, point/material costs, and board-only
  active skill definitions. No adjacency/prerequisite edges are fabricated.
- Original four board layouts: 153 positions each in the pinned snapshot.
  The snapshot has 62 app characters, 54 with board references and 8 without;
  unavailable boards are labeled, not replaced with another character's layout.
- Connect selection from existing owned cards, current awakening-derived Connect
  level and translated effect description, raw range diagram and slot-relative
  highlight. Card-ID uniqueness, used-location badges, confirmed atomic move/
  replacement, stale-confirmation guards and ownership reconciliation are retained.
- Memory count stores blank separately from zero; bonus coefficients are looked
  up in `PosterCollectEffect` (30 -> 6%, 31 -> 6.1%, 50 -> 8%). Values beyond the
  available table are marked unknown, not extrapolated or called a confirmed cap.
- Lazy board/catalog/locale loading, failure/retry confined to the Board tab,
  original node-ID-based persistence, explicit preview conversion, JSON backup,
  localized KO/EN/JA descriptions, mobile/dark styling, and keyboard/dialog support.

## Data and synchronization

Normal `holodori-sync` now generates `boards.json` and `memory-bonuses.json`,
adds member board/card Connect/music singer links, and records board counts and
source hashes. Normalizer version is 3. `build-i18n.mjs` also builds the three
separate `i18n/boards/<locale>.json` packs (required language IDs and input hashes).
The existing version-aligned KO/EN/JA resolver is reused, never locale HEADs mixed
with a pinned core. `holodori-sync --pinned --force` reproduces the committed
`data/upstream.json` snapshot without advancing to a newer upstream revision.

The initial catalog is based on core `9234a7d99c5cfba9b71803c24a6de4c005c4842f`:
4 layouts / 612 positions / 153 node groups / 324 node definitions / 121 effects /
20 Connect effects with 40 level definitions / 17 range masks / 2 board-only
active skills / 50 memory thresholds. Counts are descriptive fixtures, not
permanent maxima. All current board language packs contain 454 required strings.

Node `(groupId, number)` identifies a variant, not an upgrade level. Resolution
requires one matching character-specific variant or one common variant. Connect
`(effectId, level)` records must never be collapsed by ID alone. Numeric raw
units, special effects with no numeric value, optional Connect-node costs,
view/unlock conditions, and omitted protobuf zero coordinates are preserved.

Validation checks the full dependency graph, variants, positions, translated
references and source revisions. The auto-merge gate treats changes/deletions to
existing board semantics, memory rules, and unknown effect types as manual-review
items. Board datasets also use immutable hashed assets in optimized Pages builds.

## Profile and migration boundary

Current storage: `holodori-decksim:boards:v1`.
Current backup: `holodori-board-profile`, version 1.
Old preview storage: `holodori-decksim:board-ui-preview:v1` (never overwritten).

Profiles store master revision, memory count, member layout ID, unlocked node IDs
and Connect card IDs. They contain no cached or manually entered score bonuses.
Old preview profiles are not loaded automatically. Use the explicit preview
import button (or import a preview JSON); inspect the confirmation and skipped
entries, then check the real board because the preview used one shared layout.
Existing real profiles are checked against stable IDs and the member's current
layout. Removed/unavailable boards or unknown nodes block ordinary overwriting
and require review. A confirmed valid import may replace a damaged profile.
Existing owned-card data is never replaced by board import. Concurrent localStorage
writes remain last-writer-wins; there is no multi-device/account server sync.

## Deliberately not claimed

The editor records an existing account state. It does not spend materials or
validate a player's actual Dream rank, board Pt budget, or all path unlock rules.
It displays Master view/unlock requirements but does not infer path rules from
coordinates. All node types remain visible, including non-live reward nodes.

Range masks are displayed as the **original relative offsets translated to the
selected slot**. Rotations/mirroring specific to the game client, all card/slot
eligibility constraints, effect overlap/rounding and final boosted node totals
are not established by this foundation. The screen labels the range preview and
these limits. No guessed stacking formula is fed into scores. Future scoring
work must separately resolve roles, targets, song conditions and effect caps.

## Verification commands

```sh
python -m pip install -e '.[test,music-search]'
python -m pytest -q
python scripts/validate-generated-data.py
node scripts/test-board-state.mjs
node scripts/test-board-data.mjs
node scripts/test-board-browser.mjs
node scripts/test-public-optimization.mjs
```

The board browser suite serves actual source/generated data/artwork over HTTP in
a disposable Chrome profile using native localStorage. It covers lazy loading,
real layouts, node edits, memory, Connect move/cancel, awakening, restoration,
explicit preview migration, KO/EN/JA, mobile dark, and score-result isolation.
It also runs against the optimized Pages artifact in CI. Screenshots are test
artifacts, not production assets. The local coding environment blocked navigation
to loopback pages; actual browser results are reported by the branch CI instead.
