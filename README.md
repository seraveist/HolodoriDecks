# Holodori DeckSim

Hololive Dreams deck simulator and master-data synchronization project.

## Current scope

The first milestone is the data layer for the deck simulator. Card and music master data are synchronized from `HolodoriDB/holodori-db-kor-diff`, normalized into stable simulator-facing schemas, and validated before they are committed.

The current sync includes:

- playable characters and Korean names
- cards, rarity, attribute and parameter ratios
- card level growth tables
- level-limit/limit-break tables
- card potential effects
- active, passive and special skill levels with Korean descriptions
- leader skills
- structured live-skill triggers and effects
- music metadata and Korean titles
- music jacket asset IDs and participating characters
- upstream Git commit and master-version provenance
- SHA-256 hashes for each watched upstream JSON file

User-owned card state and the project's separate breakthrough configuration are intentionally kept outside the upstream master-data layer.

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

## Static assets

The project is intended to run as a static GitHub Pages site, so UI images are served directly from this repository rather than through a separate asset API.

```text
assets/
  cards/   # card portraits: assets/cards/{card.id}.webp
  music/   # music jackets: assets/music/{music.id}.webp
  ui/      # project-owned type marks, rank badges, frame decoration, placeholders
```

Upstream asset keys such as `Card.assetId` and `Music.jacketAssetId` may be used while acquiring source assets, but committed files are renamed to project-owned stable paths. The front end should never depend directly on AssetBundle-internal names. Missing portraits or jackets must fall back to a project-owned placeholder.

See `assets/README.md` for the detailed naming policy.

## Local sync

Python 3.11 or newer is required.

```bash
python -m pip install -e . pytest
pytest
holodori-sync
```

`holodori-sync` first resolves one `HolodoriDB/holodori-db-kor-diff` `main` commit and reads all watched master files from that pinned commit. Their SHA-256 hashes are compared with `data/upstream.json`.

- if all watched card/music files are unchanged, normalization is skipped
- if one or more watched files changed, the full normalized data set is rebuilt and validated
- `holodori-sync --force` rebuilds the current pinned snapshot even when the hashes are unchanged

`version.txt` is kept as provenance for the game master version, but it is not intended to trigger a rebuild by itself because unrelated game master tables may change it.

## Automated validation

`.github/workflows/sync-master-data.yml` runs:

- on pull requests targeting `main`
- once per day at **00:00 KST** (`15:00 UTC`)
- by manual dispatch, with an optional force flag

Pull requests perform a full upstream download and validate that:

- normalized card data is non-empty
- normalized music data is non-empty
- generated counts agree with the manifest
- every normalized music row has a jacket asset ID
- leader cards are present
- Juufuutei Raden (`chr-06004`) has the expected R3/R4/R5 card and leader coverage
- referenced active skills have level data
- the normalized snapshot records a 40-character upstream commit SHA

Scheduled runs only commit when watched upstream JSON content actually changed. Changes to unrelated files in the HolodoriDB repository do not update the generated deck-simulator database.

## Upstream boundary

The upstream repository is treated as master-data input, not as application code. `src/holodori_decksim/sources.py` contains an explicit file allow-list so upstream schema additions require review before they enter the simulator pipeline.

The next milestone after this bootstrap is to connect the normalized card database to the six-slot deck model (1 leader + 5 members), then layer user-owned breakthrough state and score calculation on top.
