# Master-backed member boards and scoring

The `feature/member-board-ui` branch uses a version-aligned Master catalog for
the third-tab editor and compiles saved nodes into a score profile. Board effects
now reach candidate search, Worker execution, the 120-order comparison and final
results. This branch has not been released to main.

## Included

- Real member-to-layout links, original coordinates, resolved per-character node
  variants, effects, targets, conditions, point/material costs, and board-only
  active skill definitions. No adjacency/prerequisite edges are fabricated.
- Original four board layouts: 153 positions each in the pinned snapshot.
  The snapshot has 62 app characters, 54 with board references and 8 without;
  the member picker shows only the 54 with boards. Missing boards remain in the
  catalog and are never replaced with another character's layout.
- Connect selection from existing owned cards, current awakening-derived Connect
  level and translated effect description, raw range diagram and slot-relative
  highlight. Card-ID uniqueness, used-location badges, confirmed atomic move/
  replacement, stale-confirmation guards and ownership reconciliation are retained.
- Memory count stores blank separately from zero; bonus coefficients are looked
  up in `PosterCollectEffect` (30 -> 6%, 31 -> 6.1%, 50 -> 8%). Values beyond the
  available table are marked unknown, not extrapolated or called a confirmed cap.
- Lazy board/catalog/locale loading (also loaded on calculation if a saved profile exists),
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
validate a player's actual Dream rank or board Pt/material budget.
Hover/focus displays Master effects and requirements. Clicking a normal cell selects
or removes it. Grid routing uses orthogonal neighbours from the central (0, 0)
cell (always a path origin even with its Connect slot empty), minimises newly
selected cells, then path length (stable ID tie-breaks).
Multi-cell selection/removal asks for confirmation. Category controls for leader,
member, global support, and content support use the same route and disconnection
rules in one atomic update. Connect has no bulk control; any necessary Connect
path cells or removed placements are included in the confirmation. Removal keeps cells reachable
by another selected route and clears placements in disconnected cells atomically.
Legacy disconnected input is preserved on load; clicking such a cell repairs its
route after confirmation. Concurrent changes invalidate an outstanding route plan.
Connect cells open the owned-card picker with four slot statuses and a slot-removal
action; moving/replacing a card asks for confirmation in a separate dialog. All node types remain visible, including non-live reward nodes.

Range masks use the **original relative offsets translated to the selected slot**.
The current catalog's masks cannot overlap between slots; the compiler rejects
overlapping ranges if future data changes that invariant. Full game-client
placement eligibility and any non-geometric prerequisite rules still need independent validation.

## Score connection

`js/board-score.js` validates saved selections, drops unowned Connect placements
from the calculation, and compiles an immutable-per-request serializable DTO.
Only unlocked nodes contribute. Connect strength uses the card's current owned
awakening, even when deck-card growth is evaluated at maximum level. The editor
and compiler share boosted node values, without mutating the Master catalog.
Raw values retain precision until the score/stat rounding step.

- Resolve ALWAYS / selected-leader roles, self/character/group/all targets and
  song singer/category conditions. Generic unit evaluation has no song condition.
  ALL songs have no singer IDs; FUWAMOCO SOLO songs have two. Use Master categories.
- Feed rate/frequency and leader support into the existing normalized-200 unit
  display model. Active/SP invariance and passive/board allocation are retained.
- Apply rate/frequency/support to both exact-note and fallback song timelines.
  Positive probability affects expectation; maximum assumes every possible
  activation succeeds. Song-category score additions reach both goals.
- Add flat and percentage board stats and table-based memory bonuses to power.
  Current rounding is a ceiling per member/stat bucket; then existing member
  enhancement rounding applies. Account-wide effects from other members' boards
  remain eligible when their Master target/role allows it.
- Invalidate results on board edits, imports, external-tab updates and Connect
  ownership/awakening changes. Reloaded profiles work without visiting the Board
  tab. Invalid or unsupported saved inputs block calculation rather than silently
  reverting to a board-free score.

Validation distinguishes implementation coverage from in-game confirmation.
AO–AS observations reproduce exactly through real node/Connect selections; the
full earlier suite retains its documented AX/BC/BI 0.1pp residual. New aggregate
stat rounding, song-category additions and score-support-costume × board
attribution still need full-profile in-game comparisons. Score-support costumes
retain the existing costume estimate with the calibrated board/passive delta;
that allocation is not newly confirmed by this change. The recent 4.1% passive /
16.0% board screenshot cannot be reproduced conclusively until its changed board
profile is supplied. Do not tune constants to that screenshot without inputs.

Work rewards, life, leader healing/judgment nodes are retained in the editor but
do not change the current AUTO / ALL PERFECT score model (no miss/life-gauge
simulation). Unknown numeric live effects/conditions fail explicitly. Memory
counts outside the supplied table are preserved but block scoring.

## Verification commands

```sh
python -m pip install -e '.[test,music-search]'
python -m pytest -q
python scripts/validate-generated-data.py
node scripts/test-board-state.mjs
node scripts/test-board-paths.mjs
node scripts/test-board-data.mjs
node scripts/test-board-scoring.mjs
node scripts/test-board-browser.mjs
node scripts/test-public-optimization.mjs
```

The board browser suite serves actual source/generated data/artwork over HTTP in
a disposable Chrome profile using native localStorage. It covers lazy loading,
real layouts, node edits, memory, Connect move/cancel, awakening, restoration,
explicit preview migration, KO/EN/JA, mobile dark, score invalidation/recalculation,
reload without opening the editor, cross-tab changes and unsupported-memory errors.
It also runs against the optimized Pages artifact in CI. Screenshots are test
artifacts, not production assets. Windows can set `CHROME_BIN`, `PYTHON_BIN` and
`BROWSER_SMOKE_PORT` to use installed runtimes and an unused local port.
