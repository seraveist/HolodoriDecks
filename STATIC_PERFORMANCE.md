# Static public asset and rendering optimization

The application remains a static site with the same UI, KO/EN/JA routes,
storage keys and formats, score formulas, recommendation algorithm and Worker.
No card/master records or translated text are removed from repository data.

## Public build

After copying the application into `_site` and running
`scripts/rewrite-pages-revisions.py`, run:

```sh
node scripts/build-public-assets.mjs --root _site
python scripts/build-localized-pages.py --root _site
```

The existing Pages workflow does this automatically. CSS tooling requires
`python -m pip install -e '.[public-build]'`; the existing full test extra also
includes that dependency. Do not run the asset builder against the repository
root. The build is deterministic and repeated builds on the copied artifact
are supported.

* Card growth arrays are deduplicated by their full JSON content, not just a
  nominal group ID. The versioned `holodori-cards` transport restores the exact
  original rows, with independent mutable arrays per card. Every public build
  verifies a complete serialization/decode round trip. Source previews still
  accept the original array format.
* The small `manifest.json` is requested with `no-store`. Its `public_assets`
  map points to content-SHA-256 JSON filenames under `data/generated/runtime/`.
  Only these immutable filenames use `force-cache`. UI-only, translation,
  master and generated search changes therefore cannot reuse an unrelated old
  response under an unchanged master-version URL. Source previews retain the
  original fresh-fetch behavior. Optional pinned upstream language/chart
  fallback and selected-chart cancellation are unchanged.
* Original logical JSON URLs remain in the public artifact for older cached
  application versions and external consumers; the current app does not fetch
  the legacy full `cards.json`. This is network optimization, not data secrecy
  or a claim that all copies were removed from the deployment archive.
* The CSS builder expands local unconditional imports in cascade order, rebases
  relative URLs, and compacts whitespace/comment tokens through tinycss2. It
  emits one content-hashed local stylesheet; external fonts remain separate.
  Unsafe/cyclic/conditional imports fail rather than being silently reordered.
  HTML stays crawlable and retains translation/accessibility/verification
  attributes; scripts and JSON remain external.

## Loading and rendering

Locale and base data requests start together after the manifest. Song indexes
and score rules are no longer a prerequisite for startup or unit-score mode;
the first song calculation loads them once. Concurrent loads share a Promise;
failures/empty resources can be retried. A canceled/obsolete optimization may
not publish results after awaiting the shared resources.

The owned-card count remains current in every view. The hidden list performs
no filtering/sorting/DOM work and renders when opened. Rows are keyed by card
ID and reused across filters; setting changes preserve row, image and input
identity, and focus. Delegated event handlers are installed once. Normalized
out-of-range edits still correct the edited input even when the normalized
state equals its previous value. The row cache is bounded by the selectable
card count. Search/sort caches depend on the filter values and membership when
relevant. Existing score/level/awakening rules and import/export are unchanged.

## Validation

* `node scripts/test-public-optimization.mjs`: full-card round trip and mutable
  isolation, 24 whole-database preparation configurations (level mode, minimum/
  maximum level, all awakening stages), corrupted-format rejection, safe URL
  resolution, cache modes, lazy loading/retry/deduplication, deterministic
  public build and source-data preservation.
* `python -m pytest -q`: existing Python checks plus CSS token/cascade/URL tests.
* `node scripts/test-browser-smoke.mjs`: existing source-site goals, scoring,
  state, cancellation, Exact/fallback and languages, plus owned-row/input/focus
  retention, repeated clamped edits, filtered-row reuse, modal events, zero
  hidden-list mutations and deferred song requests.
* `Validate Static App` runs source-site checks for code/data changes and has
  a parallel `public` job serving the optimized Pages artifact with
  `BROWSER_SMOKE_ROOT`. The required `validate` result includes this job. It verifies
  use of compact hashed card transport and an actual browser-cache hit after
  reload, while the mutable manifest is not cached. Screenshots and public
  browser logs are uploaded as `static-optimization-validation`.

The combined workflow retains manual dispatch and avoids duplicate branch-push runs.
Image-only changes still exercise the built browser; known documentation-only
changes run metadata checks. CI and Pages use `scripts/build-pages-artifact.py`
to build the same layout, while Pages avoids repeating the full test suite.
See [CI execution and reuse](LOCAL_TEST.md#13-ci-실행과-무거운-검사-재사용)
for expensive scoring checks and the full-validation option.

Transfer-size reductions are not end-to-end latency or score-search speedup
claims. Decoding still reconstructs the full original arrays to preserve
existing consumers and mutation isolation; no memory reduction is promised.

## Stable startup and frontend cleanup

The initial HTML contains all three navigation tabs and their associated
panels, including the localized Member Boards label. The navigation grid has
three columns before JavaScript runs. Data initialization enables the existing
tabs; it never inserts a tab or changes the grid. Static loading copy and a
disabled calculation button describe the pending state. Theme and language
controls are connected before waiting for the manifest and locale data.

The board editor, catalog and stylesheet still load on demand. Card detail
parameters load when the dialog opens, with a visible loading state; closing
the dialog prevents late module completion from reopening it. Recommendation
preparation loads at calculation time. The explicit non-worker optimizer path
loads its engine only when requested and checks cancellation again afterward.
The card-list comparator lives in a small shared module so opening/sorting a
list does not import the recommendation engine. Existing recommendation
exports, calculations, storage and tie-breaking order are preserved.

CSS tokens have one definition in `tokens.css`. Shared card typography uses
normal cascade rules rather than competing per-view sizes and `!important`.
Desktop result columns and mobile scrolling rules live in their owning
component/responsive files; the former `tweaks.css` override layer is removed.
Confirmed unused header/footer, recommendation-note and old result-scorebar
rules are removed. Dark-theme exceptions, hidden-state enforcement and reduced
motion rules remain. Dynamically generated board-kind and card-skill selectors
are retained. Default numeric formatting reuses one formatter per locale;
explicit formatter options retain native behavior.

The public CSS builder also removes declaration/block padding, preserving
selector combinators, strings, custom-property tokens, `calc()` spacing and
conditional rule order. Board CSS is compacted into its own content-hashed
file and remains lazy. Logical source asset URLs remain for compatibility.

Browser regressions hold the manifest request while inspecting root/KO/EN/JA
HTML at desktop/mobile/narrow widths, including normal and cache-bypassing
reloads. They require three visible tabs with unchanged geometry, working
theme controls during loading, and intact navigation after a failed startup
request. They also check that calculation modules are absent from startup,
closing a loading detail dialog stays closed, and card typography keeps its
13/11/10px scale across result and owned-card views. Public-build checks cover
lazy CSS hashing, deterministic rebuilding and safe compaction.
