# Holodori DeckSim card portrait synchronization

Card Master data and card portrait binaries are intentionally synchronized by separate pipelines.

- Master data is normalized from the version-aligned HolodoriDB repositories.
- Portraits are required only for selectable rarity ★4/★5 cards.
- Missing portraits never block Master-data publication; the UI falls back to `assets/ui/card-placeholder.svg` until the portrait pipeline succeeds.

## Production flow

```text
Master-data PR merged to main
        ↓
main/data/generated/cards.json changes
        ↓
Sync Holodori card assets workflow
        ↓
audit assets/cards/{card.id}.webp for ★4/★5
        ↓
missing cards only
        ↓
resolve current asciisyaez/yagoo-dori public card-art commit
        ↓
validate card-art-manifest.json + per-file SHA-256
        ↓
copy verified 300×300 WebP card icons
        ↓ missing snapshot rows only
Octo catalog fallback
        ↓
assetId-based AssetBundle candidate search / decrypt / UnityPy extraction
        ↓
zero-missing audit + generated-data validation
        ↓
automation/card-asset-sync
        ↓
automated review PR
        ↓
manual merge
        ↓
GitHub Pages deployment
```

The image workflow never auto-merges.

## Triggering

`.github/workflows/sync-card-assets.yml` runs:

- when `main` receives a changed `data/generated/cards.json`;
- when the asset-sync implementation itself is merged;
- once per day at **00:45 KST** so assets can be retried when an upstream image source lags behind Master publication;
- by manual `workflow_dispatch`.

A manual `dry_run` resolves portraits but does not push the automation branch or create a PR.

## Primary public card-art snapshot

The first source is the published card-art snapshot maintained by `asciisyaez/yagoo-dori`.

At each run the synchronizer resolves the repository's current `main` commit through the GitHub API, then pins every manifest and image request to that exact commit. It reads:

```text
data/generated/card-art-manifest.json
apps/web/public/game/cards/{card.id}.webp
```

A public-snapshot image is accepted only when:

- the manifest contains the exact current Master `card.id`;
- its local path is exactly `/game/cards/{card.id}.webp`;
- the downloaded bytes are WebP;
- SHA-256 matches the manifest when supplied;
- decoded width/height match the manifest when supplied;
- dimensions remain inside the DeckSim 128..768 pixel portrait bounds.

The current published snapshot contains the five 2026-08 additions and therefore avoids the game catalog request that currently returns HTTP 403 from GitHub-hosted runners.

The snapshot itself records the public page/image source used for each card; DeckSim copies those provenance fields into `assets/card-portrait-sync.json`.

## Octo fallback

If a current Master card is not yet present in the public snapshot, the pipeline falls back to the game Octo CDN through:

- tool repository: `HolodoriDB/holodori-asset-tools`
- pinned tool commit: `85b70c9b0024e91ea566dacafe8374e1c4212cf5`

The tool is build-time only and is never shipped to the browser or Pages artifact.

The fallback searches the current Octo AssetBundle catalog using Master `asset_id`, downloads bundle dependencies, decrypts them, loads them through UnityPy and ranks `Sprite` / `Texture2D` objects. Existing committed portraits are never overwritten.

If the Octo catalog itself is unavailable, the sync report records the fallback error and unresolved IDs instead of losing the earlier public-snapshot result.

## Safety properties

- ★3 cards are excluded by policy.
- Existing committed portraits are never overwritten by automatic sync.
- Only cards currently present in `data/generated/cards.json` are targets.
- No partial image PR is created while a target remains unresolved.
- `--require-complete` requires zero missing ★4/★5 portraits.
- Each accepted output is validated as WebP and limited to 768×768.
- The normal generated-data validator runs after portrait import.
- Pages/runtime retains its placeholder fallback for unexpected missing files.

## Provenance

Automated imports create/update:

```text
assets/card-portrait-sync.json
```

Public-snapshot records include:

- Master `asset_id`;
- resolved source repository commit;
- source manifest/path/page/URL;
- source dimensions;
- output SHA-256.

Octo fallback records include its catalog revision, bundle/object names, Unity object/type, dimensions and output SHA-256.

The original bootstrap portrait set predates this automation and is not retroactively rewritten or re-downloaded.

## Local audit

No external asset dependency is required just to audit the repository:

```bash
python -m pip install -e '.[test]'
python scripts/sync-card-assets.py
```

To fail when any ★4/★5 portrait is missing:

```bash
python scripts/sync-card-assets.py --require-complete
```

## Local live synchronization

The primary GitHub-hosted source uses only standard HTTP plus Pillow validation. Install the pinned Octo tool as well if fallback extraction may be required:

```bash
python -m pip install -e '.[test]'
python -m pip install \
  'git+https://github.com/HolodoriDB/holodori-asset-tools.git@85b70c9b0024e91ea566dacafe8374e1c4212cf5'
```

Then run:

```bash
python scripts/sync-card-assets.py \
  --sync \
  --catalog-cache /tmp/holodori-octo-list.json \
  --provenance assets/card-portrait-sync.json \
  --report /tmp/card-asset-sync.json
```

## Failure handling

Master-data updates remain independent of portrait availability. If both the public snapshot and Octo fallback lack a new card, the site can publish its card data with the placeholder while the image workflow reports unresolved IDs and retries at the next scheduled run.
