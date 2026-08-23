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
current Octo catalog
        ↓
assetId-based AssetBundle candidate search
        ↓
download + decrypt candidate bundle/dependencies
        ↓
UnityPy Sprite / Texture2D extraction
        ↓
select the card illustration candidate
        ↓
normalize to WebP (max 768×768, quality 90)
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
- once per day at **00:45 KST** so a portrait can be retried if the game asset CDN/catalog lags behind the Master publication;
- by manual `workflow_dispatch`.

A manual `dry_run` resolves and extracts portraits but does not push the automation branch or create a PR.

## Source and tool pin

The production workflow uses the game Octo CDN through the public asset tooling:

- tool repository: `HolodoriDB/holodori-asset-tools`
- pinned tool commit: `85b70c9b0024e91ea566dacafe8374e1c4212cf5`

The pin makes the extraction implementation reviewable while the tool itself resolves the current app version/Octo keys and current asset catalog at runtime.

`holodori-asset-tools` is build-time tooling only. It is not shipped to the browser or included in the static Pages artifact.

## Matching rules

The app-facing card row already contains the upstream `asset_id`. The portrait synchronizer searches current Octo AssetBundle metadata by that identifier.

Candidate ranking prefers:

- an exact normalized `asset_id` match in the bundle name/object name;
- card/image/illustration/still/portrait semantics;
- non-movie resources.

It can also fall back to a structural card match containing both the character token and the unique card sequence when the catalog path does not embed the complete `asset_id` verbatim.

For each candidate bundle the synchronizer downloads the bundle plus catalog-declared dependencies, decrypts them with the pinned asset tool, loads them in one UnityPy environment, and inspects `Sprite` / `Texture2D` objects.

Image ranking prefers:

- the complete card `asset_id` in the Unity object name;
- matching character/sequence tokens;
- `Sprite` over raw `Texture2D`;
- illustration/card/main/still/portrait naming;
- larger usable images;
- non-icon/non-mask/non-thumbnail objects.

Images smaller than 128×128 are rejected.

## Safety properties

- ★3 cards are excluded by policy.
- Existing committed portraits are never overwritten by automatic sync.
- Only cards currently present in `data/generated/cards.json` are targets.
- A live sync with any unresolved target exits non-zero and does not create a partial image PR.
- After extraction, `--require-complete` requires zero missing ★4/★5 portraits.
- Each new output is validated as WebP and limited to 768×768.
- The normal generated-data validator is run after portrait import.
- Pages/runtime code still has a placeholder fallback if an image is unexpectedly unavailable.

## Provenance

Automated imports create/update:

```text
assets/card-portrait-sync.json
```

For each automated portrait it records:

- Master `asset_id`;
- Octo catalog revision;
- selected catalog bundle/object name;
- selected Unity object and object type;
- source dimensions;
- output SHA-256.

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

Install the same pinned asset tool used by CI:

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

The live command does not overwrite portraits that already exist.

## Failure handling

A Master-data update can be merged even when the image CDN/catalog is temporarily unavailable. In that case the static app immediately gains the new card data and uses the existing placeholder.

The image workflow reports the unresolved card IDs and retries on the next scheduled run. Once all missing portraits resolve, it opens/refreshes `automation/card-asset-sync` for human review.
