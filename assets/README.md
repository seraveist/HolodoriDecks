# Static assets

Holodori DeckSim is intended to run as a static GitHub Pages site. Card portraits and music thumbnails are therefore served directly from this repository instead of an external asset API.

## Layout

```text
assets/
  cards/   # card portraits
  music/   # music jacket thumbnails
  ui/      # project-owned UI icons, badges and placeholders
```

## Naming rules

Card portraits use the normalized upstream card ID:

```text
assets/cards/{card.id}.webp
```

Example:

```text
assets/cards/card-06004-5-uniq-0060-00.webp
```

Music thumbnails use the normalized music ID:

```text
assets/music/{music.id}.webp
```

Example:

```text
assets/music/m0049.webp
```

The source master exposes `Card.assetId`, `Music.jacketAssetId`, and `Music.assetId`. Asset acquisition tooling may use those upstream keys to locate source images, but files committed to this project are renamed to the stable rules above so the UI does not depend on game-internal bundle names.

`data/generated/music.json` preserves `jacket_asset_id` and `asset_id` for this acquisition step.

## Initial portrait coverage

The initial bootstrap imported 115 card WebP files from a pinned snapshot of `yandereloveme/hololive-dreams-calc`. The source's `cards.json` maps its image filenames to the canonical Holodori card IDs, so the imported files were renamed directly to this project's card-ID naming rule.

At bootstrap time the canonical master contained 169 cards. The source snapshot covered all rarity-4/5 portraits it knew about but did not include 54 rarity-3 portraits. Those entries intentionally use the project placeholder until their actual assets are imported locally. Full bootstrap provenance and the missing IDs are recorded in `assets/card-portrait-source.json`.

## Local asset preparation

The game CDN currently rejects Octo catalog requests made from GitHub-hosted Actions runners, so binary game-asset acquisition is intentionally **not** part of the scheduled GitHub workflow. Master data stays automated; missing card portraits and music jackets are prepared locally when needed and then committed as static Pages assets.

For local browsing/extraction, the project can use the community `HolodoriDB/holodori-asset-tools` utility:

```bash
python -m pip install "git+https://github.com/HolodoriDB/holodori-asset-tools.git"
holodori serve
```

Music jacket bundles follow the observed asset naming convention:

```text
assetbundles/img_music_jacket_{music.id}/img_music_jacket_{music.id}
```

For example, when preparing `m0049`, search for `img_music_jacket_m0049` in the local asset browser.

After exporting/extracting the relevant image files to a local folder, install this project's optional image tools and run the importer:

```bash
python -m pip install -e ".[assets]"
holodori-assets /path/to/extracted/images --dry-run
holodori-assets /path/to/extracted/images
```

The importer reads `data/generated/cards.json` and `data/generated/music.json`, searches filenames/paths for each `asset_id` or `jacket_asset_id`, resizes the selected image for UI use and writes normalized WebP files into `assets/cards/` or `assets/music/`.

If an extracted filename cannot be matched reliably, copy `assets/source-map.example.json` to `assets/source-map.json` and specify the relative source file manually. Explicit mappings always take precedence over automatic matching.

The helper `scripts/inspect_asset_catalog.py` is retained for local catalog investigation. It requires `holodori-asset-tools` to be installed and is not used by CI.

## UI-owned assets

`assets/ui/` contains project-created UI artwork rather than copied in-game UI images. The initial set includes:

- `type-cute.svg`
- `type-pure.svg`
- `type-happy.svg`
- `rank-d.svg`
- `rank-c.svg`
- `rank-b.svg`
- `rank-a.svg`
- `rank-s.svg`
- `card-placeholder.svg`
- `music-placeholder.svg`

## Missing assets

The application must tolerate a missing portrait or jacket. Missing files should fall back to `assets/ui/card-placeholder.svg` or `assets/ui/music-placeholder.svg` instead of making the card/music entry unusable.

## Image format

Imported portraits and music jackets are normalized to WebP. The importer currently caps card images at 768 px and music jackets at 512 px on the longest edge while preserving aspect ratio, using WebP quality 90 by default. These values can be adjusted later once the final UI dimensions are fixed.
