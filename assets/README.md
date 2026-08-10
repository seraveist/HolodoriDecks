# Static assets

Holodori DeckSim is intended to run as a static GitHub Pages site. Only card portraits needed by the UI are stored as binary game assets.

## Scope

```text
assets/
  cards/   # rarity-4/5 card portraits only
  ui/      # project-created type marks, rank badges and fallback UI
```

Music jacket thumbnails are intentionally not managed by this project. Music remains fully available through `data/generated/music.json`, but the UI should present songs using text/metadata rather than jacket images.

Rarity-3 cards remain in `data/generated/cards.json` for calculation and selection logic, but they intentionally have no portrait files. Portrait resources are maintained only for rarity 4 and 5.

## Card portrait naming

```text
assets/cards/{card.id}.webp
```

Example:

```text
assets/cards/card-06004-5-uniq-0060-00.webp
```

The initial portrait set contains all **115 rarity-4/5 cards** in the current 169-card master snapshot. Provenance is recorded in `assets/card-portrait-source.json`.

## Local card-image import

If future rarity-4/5 cards need portraits, locally extracted images can be normalized with:

```bash
python -m pip install -e ".[assets]"
holodori-assets /path/to/extracted/card-images --dry-run
holodori-assets /path/to/extracted/card-images
```

The importer reads `data/generated/cards.json`, ignores rarity-3 cards, matches source filenames by `asset_id`, converts selected images to WebP and writes them to `assets/cards/`.

For ambiguous source filenames, copy `assets/source-map.example.json` to `assets/source-map.json` and provide an explicit card mapping.

## Project-owned UI assets

`assets/ui/` currently contains:

- `type-cute.svg`
- `type-pure.svg`
- `type-happy.svg`
- `rank-d.svg`
- `rank-c.svg`
- `rank-b.svg`
- `rank-a.svg`
- `rank-s.svg`
- `card-placeholder.svg`
- `manifest.json`

Score-rank `+` variants should be rendered as a text overlay on the base rank badge rather than separate image files.

`card-placeholder.svg` is reserved for an unexpected missing/broken rarity-4/5 portrait; rarity-3 cards should not request a portrait in the first place.
