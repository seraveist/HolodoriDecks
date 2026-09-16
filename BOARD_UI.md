# Member board UI preview

This branch adds a third **Member Boards** tab to the existing application. It is
an independently persisted UI preview, not an account-aware scoring release.

## Included

- Account-wide memory count (blank and zero are distinct).
- Full member roster, localized names, production and configured-state filters.
- Member detail routes (`#board/<characterId>`), selectable nodes, zoom, fit and
  an accessible list alternative to the spatial board.
- Four reference connector slots. Cards are selected from the existing owned-card
  store; their current level, awakening and existing connector location are shown.
- A card ID may occupy only one connector slot across this preview workspace.
  Different card versions of the same member remain distinct cards.
- A move requires confirmation, removes the old assignment and updates the target
  in one state transaction. Replacing an occupied target is explicitly disclosed.
  Confirmation checks that both source and target still match the shown state.
- Removing a card from the owned list releases its connector assignment. Node
  selection and memory count are retained.
- Local persistence, validated JSON backup/restore, visible storage errors and
  keyboard/dialog focus handling. Existing owned-card data is never overwritten
  by a board import.
- Korean, English and Japanese UI strings; theme-token and mobile layouts.

## Deliberately deferred

No master-data sync workflow, normalizer, generated data, scoring formula,
optimizer or release version is changed.

Every member currently uses the same **153-node `tree-model-001` reference**.
Coordinates and node group IDs were transcribed from
`HolodoriDB/holodori-db-kor-diff@9234a7d99c5cfba9b71803c24a6de4c005c4842f`,
`SkillTreeNodePosition.json`. Four reference connector IDs are `S-001` through
`S-004`. The module and screen both mark this as a UI reference, **not each
member's actual board**.

Character-specific layouts, node overrides/effects/costs, prerequisites, player
level/point constraints, connector eligibility rules, effect-range overlays,
stacking, and score integration require the later master-data phase. No effect
values or dependency edges are fabricated. The memory count is stored only;
`PosterCollectEffect` is not yet imported or applied.

The preview offers global card-ID uniqueness as a UI rule; it is not a claim
that all in-game placement restrictions have already been reproduced.

## Data boundary

Storage key: `holodori-decksim:board-ui-preview:v1`.
Backup format: `holodori-board-ui-preview`, version `1`.
Layout ID: `tree-model-001-ui-reference-v1`.

Saved state contains the memory count, selected node IDs and connector card IDs,
keyed by character ID. It contains no manually entered or cached score bonuses.
It must **not** silently migrate to production scoring inputs when live board
models are added. Add an explicit validation/migration or a new profile namespace
in that phase.

The editor re-reads the latest stored profile before each mutation to preserve
sequential changes from another tab. Simultaneous localStorage writes remain
last-writer-wins; there is no transactional multi-device synchronization.
A corrupt or future-version profile is not auto-overwritten by normal edits.
An explicitly confirmed, validated backup import may replace it.

## Code map

- `js/board-entry.js`: lightweight tab shell and lazy editor import.
- `js/board-preview-layout.js`: static coordinate fixture, isolated from scoring.
- `js/board-state.js`: immutable mutations, duplicate/move guards and persistence.
- `js/board-copy.js`: localized UI messages.
- `js/ui/boards.js`: roster, board, connect picker and backup interactions.
- `css/boards.css`: scoped board styles, loaded on first board entry.
- `js/app.js`: third-tab integration, hash routes and keyboard tab navigation.

## Verification

Run the new state suite from the repository root with Node 22:

```sh
node scripts/test-board-state.mjs
```

24 cases passed during this change: layout consistency, memory validation,
immutable selection, ownership and slot guards, cross-board and same-board moves,
occupied-target replacement, stale confirmations, removal/reconciliation,
backup validation, persistence, damaged storage and write failures.

Additionally, 17 scenario groups were exercised in Chromium using the actual
modified app/board modules in an isolated harness. Existing app dependencies,
card/character fixtures, artwork and browser storage were mocked because direct
browser navigation to the repository/server was unavailable. Scenarios covered
navigation, selection, picker filters and location badges, move/cancel/replace,
Escape/focus, backup/restore, ownership removal, write errors and a 390px dark
mobile layout. The harness did not exercise the deployed app, real image assets,
network lazy-loading, native localStorage or the full existing regression suite.
The harness and fixture screenshots are not production assets.

Before merging, run the repository's normal validation and inspect the branch
with its real assets/server, including initial lazy CSS loading and locale routes.
