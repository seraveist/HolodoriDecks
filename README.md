# Holodori DeckSim

Hololive Dreams deck simulator and master-data synchronization project.

## Prepared baseline

The repository now contains the three baseline resource groups needed to start the static GitHub Pages UI:

1. normalized card data
2. normalized music data
3. static UI resources and card portrait assets

The current committed master snapshot contains **169 cards**, **182 music tracks**, and **62 playable characters**. Card/music master data is synchronized from `HolodoriDB/holodori-db-kor-diff`, normalized into stable simulator-facing schemas, and validated before it is committed.

## Card data

`data/generated/cards.json` includes:

- canonical card/character IDs and Korean names
- rarity and attribute
- Performance / Technique / Sense distribution ratios
- card level growth curves
- level-limit/limit-break tables
- card potential effects
- active, passive and special skill levels with Korean descriptions
- leader skill data
- structured skill triggers/effects
- upstream `asset_id`
- pinned source commit/master version provenance

User-owned card state and the project's separate breakthrough configuration intentionally remain outside the canonical master rows.

## Music data

`data/generated/music.json` includes:

- music ID and Korean title
- singer display name and participating character IDs
- playback length
- music category/release type
- score coefficient and score-rank group IDs
- MV URL when available
- `jacket_asset_id` and music `asset_id`
- pinned source commit/master version provenance

## Data layout

```text
data/
  upstream/        # downloaded raw upstream JSON; ignored by git
  generated/       # normalized simulator-facing JSON; committed by sync workflow
  upstream.json    # pinned upstream commit + watched file hashes
  sync_state.json  # last successful normalized snapshot
```

Generated files:

- `data/generated/cards.json`
- `data/generated/characters.json`
- `data/generated/music.json`
- `data/generated/master_refs.json`
- `data/generated/manifest.json`

Every normalized card/music row keeps the pinned upstream commit and master version so changes can be diffed reliably.

## Static UI resources

The project is intended to run as a static GitHub Pages site, so images are served directly from this repository rather than through a separate asset API.

```text
assets/
  cards/   # assets/cards/{card.id}.webp
  music/   # assets/music/{music.id}.webp
  ui/      # project-created icons, badges and placeholders
```

### Card portrait baseline

An initial pinned community snapshot was used to bootstrap **115 real card WebP portraits** into `assets/cards/`. The current canonical master has 169 cards; the remaining **54 missing portraits are all rarity-3 cards** and fall back to `assets/ui/card-placeholder.svg` until their actual source images are imported locally.

Portrait bootstrap provenance and the exact missing-card list are stored in `assets/card-portrait-source.json`.

### Project-owned UI assets

The initial UI resource set is:

- Cute / Pure / Happy type SVGs
- D / C / B / A / S score-rank SVGs
- card placeholder SVG
- music placeholder SVG
- `assets/ui/manifest.json` for frontend mapping

Score-rank `+` variants should be rendered as a text overlay on the base rank badge rather than duplicated image files.

### Music jackets

All 182 music rows already carry their canonical `jacket_asset_id`. The observed game bundle naming convention is:

```text
assetbundles/img_music_jacket_{music.id}/img_music_jacket_{music.id}
```

The game CDN rejects catalog requests from GitHub-hosted Actions runners, so music-jacket acquisition is deliberately a local one-time/update task instead of part of scheduled CI. Until a jacket is imported, the UI uses `assets/ui/music-placeholder.svg`.

See `assets/README.md` for extraction/import commands.

## Local asset import

The included importer maps locally extracted game images to stable GitHub Pages paths.

```bash
python -m pip install -e ".[assets]"
holodori-assets /path/to/extracted/images --dry-run
holodori-assets /path/to/extracted/images
```

It matches card `asset_id` and music `jacket_asset_id`, converts selected images to WebP, and writes them to `assets/cards/` or `assets/music/`. Ambiguous filenames can be overridden with `assets/source-map.json` using `assets/source-map.example.json` as a template.

## Master-data sync

Python 3.11 or newer is required.

```bash
python -m pip install -e . pytest
pytest
holodori-sync
```

`holodori-sync` first resolves one `HolodoriDB/holodori-db-kor-diff` `main` commit and reads all watched master files from that pinned commit. Their SHA-256 hashes are compared with `data/upstream.json`.

- if all watched card/music files are unchanged, normalization is skipped
- if one or more watched files changed, the full normalized data set is rebuilt and validated
- `holodori-sync --force` rebuilds the current pinned snapshot even when hashes are unchanged

`version.txt` is kept for provenance but does not trigger a rebuild by itself.

## Automated validation

`.github/workflows/sync-master-data.yml` runs:

- on pull requests targeting `main`
- once per day at **00:00 KST** (`15:00 UTC`)
- by manual dispatch, with an optional force flag

Pull requests validate that:

- card and music data are non-empty
- generated counts agree with the manifest
- every music row has a jacket asset ID
- leader cards are present
- Juufuutei Raden (`chr-06004`) has R3/R4/R5 card and leader coverage
- referenced active skills have level data
- the normalized snapshot records a valid pinned upstream commit SHA

Scheduled runs only commit when watched upstream JSON content actually changes. Unrelated HolodoriDB changes do not rebuild the deck-simulator database.

## Next milestone

The next milestone is the static UI itself: connect the prepared card/music data and asset conventions to the six-slot deck model (1 leader + 5 members), then layer user-owned breakthrough state and score calculation on top.
