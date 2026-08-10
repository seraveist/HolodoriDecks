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

## UI-owned assets

`assets/ui/` is reserved for artwork created specifically for this project, such as Cute/Pure/Happy markers, rank/score badges, card frame decoration and missing-image placeholders.

## Missing assets

The application must tolerate a missing portrait or jacket. Missing files should fall back to a project-owned placeholder instead of making the card/music entry unusable.

## Image format

Use WebP for portraits and music jackets unless there is a concrete reason to retain another format. Keep only the resolution needed by the UI rather than archival-resolution source images.
