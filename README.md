# Holodori DeckSim

Hololive Dreams deck simulator and master-data synchronization project.

## Prepared baseline

The repository contains the baseline resources needed to start the static GitHub Pages UI:

1. normalized card data
2. normalized music data
3. rarity-4/5 card portraits and project-created UI resources

The current committed master snapshot contains **169 cards**, **182 music tracks**, and **62 playable characters**. Card/music master data is synchronized from `HolodoriDB/holodori-db-kor-diff`, normalized into stable simulator-facing schemas, and validated before it is committed.

## Card data

`data/generated/cards.json` includes canonical IDs/Korean names, rarity/attribute, Performance/Technique/Sense distribution ratios, level growth, level-limit data, potential effects, active/passive/special skill levels, leader skills, structured triggers/effects and upstream provenance.

All rarity-3/4/5 cards remain in canonical data. User-owned breakthrough state stays separate from the upstream master rows.

## Music data

`data/generated/music.json` includes music ID/Korean title, singer information, participating characters, playback length, category/release type, score coefficient/rank groups, MV URL and upstream provenance.

**Music jacket thumbnails are not part of the project asset scope.** The music picker/result UI should use textual metadata rather than jacket images.

## Static UI resources

```text
assets/
  cards/   # rarity-4/5 portraits: assets/cards/{card.id}.webp
  ui/      # project-created type marks, score-rank badges and fallback UI
```

### Card portrait policy

Only rarity **4 and 5** cards use portrait images. The current master contains **115 rarity-4/5 cards**, and all 115 portraits are committed under `assets/cards/`.

Rarity-3 cards remain usable in data/calculation logic but intentionally do not have portrait resources. This is a deliberate policy, not a missing-asset condition.

Portrait bootstrap provenance is stored in `assets/card-portrait-source.json`.

### Project-owned UI assets

The current set includes:

- Cute / Pure / Happy type SVGs
- D / C / B / A / S score-rank SVGs
- card fallback SVG for unexpected broken/missing rarity-4/5 images
- `assets/ui/manifest.json` for frontend mapping

Score-rank `+` variants should be rendered as a text overlay on the base rank badge.

## Local portrait import

Future rarity-4/5 card images can be added from locally extracted sources with:

```bash
python -m pip install -e ".[assets]"
holodori-assets /path/to/extracted/card-images --dry-run
holodori-assets /path/to/extracted/card-images
```

The importer ignores rarity-3 cards, matches source files by card `asset_id`, converts them to WebP and writes canonical `assets/cards/{card.id}.webp` paths. Ambiguous names can be overridden through `assets/source-map.json`.

## Master-data sync

Python 3.11 or newer is required.

```bash
python -m pip install -e . pytest
pytest
holodori-sync
```

`holodori-sync` resolves one pinned `HolodoriDB/holodori-db-kor-diff` `main` commit and compares SHA-256 hashes for the watched card/music master files with `data/upstream.json`.

- unchanged watched files: normalization is skipped
- changed watched files: the normalized snapshot is rebuilt and validated
- `holodori-sync --force`: rebuilds the pinned snapshot even when hashes are unchanged

`version.txt` is recorded for provenance but does not trigger a rebuild by itself.

## Automated validation

`.github/workflows/sync-master-data.yml` runs on pull requests, once per day at **00:00 KST** (`15:00 UTC`), and by manual dispatch.

Validation covers card/music data counts, leader/skill references, Raden R3/R4/R5 coverage, pinned upstream provenance, and the static-resource contract that **every rarity-4/5 card has a portrait while rarity-3 has none**.

## Next milestone

Connect the prepared card/music data and static resources to the GitHub Pages UI: 1 leader + 5 member slots, card picker, music picker, then layer user-owned breakthrough state and score calculation on top.
