# Holodori DeckSim data synchronization

`HolodoriDecks` keeps game data as committed static JSON so the GitHub Pages app has no runtime backend dependency. Upstream updates are therefore normalized, validated, and reviewed through a generated pull request.

## Source alignment

Core data comes from:

- `HolodoriDB/holodori-db-kor-diff`

Display translations come from:

- `HolodoriDB/holodori-db-kor-diff`
- `HolodoriDB/holodori-db-eng-diff`
- `HolodoriDB/holodori-db-jpn-diff`

The three locale repositories do **not** need the same Git commit SHA. The sync resolver first reads the core `version.txt`, then resolves the newest KO/EN/JA commit whose own `version.txt` contains exactly the same 64-character master revision. If a locale mirror is temporarily behind, recent commits that touched `version.txt` are searched. If no matching snapshot can be found, synchronization fails rather than mixing versions.

## Generated data flow

```text
HolodoriDB core + locale repositories
        ↓
holodori-sync
        ↓
cards.json / characters.json / music.json
master_refs.json / manifest.json
        ↓
build-i18n.mjs
        ↓
i18n/ko.json / en.json / ja.json
        ↓
build-chart-index.mjs
        ↓
chart-index.json / live-score-rules.json
        ↓
validate-generated-data.py
+ pytest
+ chart scoring regression
+ JavaScript syntax checks
        ↓
automation/master-data-sync branch
        ↓
automated review PR (when repository permission allows)
        ↓
manual merge
        ↓
GitHub Pages deployment
```

The workflow never auto-merges upstream data.

## Workflow

`.github/workflows/sync-master-data.yml` runs every day at **00:15 KST** and can also be started manually.

Manual inputs:

- `force`: rebuild the currently resolved snapshot even if source references are unchanged.
- `dry_run`: run normalization and all validation without pushing the automation branch or creating/updating a PR.

The automation branch is fixed as:

```text
automation/master-data-sync
```

If a sync PR is already open, the branch is regenerated from the current `main` and the existing PR is refreshed instead of opening duplicates.

### Repository permission for automatic PR creation

GitHub has a repository-level switch separate from workflow YAML permissions. For fully automatic PR creation, enable:

**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**

The workflow still requests only the repository-scoped `contents: write` and `pull-requests: write` token permissions it needs.

If this repository switch is disabled, synchronization does **not** discard the result and does not auto-merge anything. The validated data is still pushed to `automation/master-data-sync`; the workflow records a warning and places a direct compare/PR link plus the setting path in the Actions job summary. Enabling the switch later restores automatic PR creation without changing the sync code.

## Core normalization

The Python package under `src/holodori_decksim/` rebuilds the same app-facing schema used by the score engine:

- cards and playable characters
- music metadata
- card level growth and limit-break metadata
- potential/awakening metadata
- leader skills and conditions
- active/passive/special skill levels
- skill triggers and effect groups

The sync source file list is intentionally explicit in `sources.py` so an upstream schema dependency is visible in review.

## Safety validation

`scripts/validate-generated-data.py` rejects or flags dangerous output before a PR is created.

Validation includes:

- non-empty and unique card/character/music IDs
- manifest count consistency
- valid 40-character source/locale commit SHAs
- valid 64-character master revision
- KO/EN/JA locale set and version alignment
- card → character reference integrity
- active/passive/special skill level references
- leader-count consistency and Raden leader regression
- required master reference groups
- catastrophic card/character/music count drops compared with the previous manifest
- chart-index and score-rule source commit consistency
- exact SUS metadata music/difficulty/hash/note-count consistency
- locale pack commit alignment and minimum pack size

Missing local card artwork is reported but does not fail the sync because the web UI can fall back while artwork is prepared separately.

## Exact chart metadata

Files under `data/generated/charts/` are preserved across master synchronization. `build-chart-index.mjs` only enables an exact chart file when it still matches the current Master:

- `musicId`
- difficulty
- `chartHash` when present
- full-combo note count
- exact note array length

If any of these no longer match after an upstream chart revision, the file remains in the repository for provenance but its `metadataPath` is removed from the generated chart index. The stale file therefore cannot silently affect live-score or SP-order calculations.

The top-level chart index records both enabled exact metadata count and stale metadata count.

## Local commands

Install the sync tool and tests:

```bash
python -m pip install -e '.[test]'
```

Resolve and rebuild only when upstream references changed:

```bash
holodori-sync
```

Force the current aligned snapshot to be normalized:

```bash
holodori-sync --force
```

Then rebuild derived data and validate:

```bash
node scripts/build-i18n.mjs
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
python -m pytest -q
node scripts/test-chart-scoring.mjs
```

## State files

A successful synchronization writes deterministic provenance files:

- `data/upstream.json`: resolved core/locale snapshot and SHA-256 hashes of normalization inputs.
- `data/sync_state.json`: master revision, locale commits, change triggers, and normalized record counts.

No run timestamp is stored in these files, so forcing an unchanged snapshot does not manufacture a content diff.
