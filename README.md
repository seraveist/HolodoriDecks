# Holodori DeckSim

Hololive Dreams deck simulator and card master-data synchronization project.

## Current scope

The first milestone is the data layer for the deck simulator. Card master data is synchronized from `HolodoriDB/holodori-db-kor-diff`, normalized into a stable simulator-facing schema, and validated before it is committed.

The current sync includes:

- playable characters and Korean names
- cards, rarity, attribute and parameter ratios
- card level growth tables
- level-limit/limit-break tables
- card potential effects
- active, passive and special skill levels with Korean descriptions
- leader skills
- structured live-skill triggers and effects
- upstream master version tracking

User-owned card state and the project's separate breakthrough configuration are intentionally kept outside the upstream master-data layer.

## Data layout

```text
data/
  upstream/        # downloaded raw upstream JSON; ignored by git
  generated/       # normalized simulator-facing JSON; committed by sync workflow
  sync_state.json  # last normalized upstream master version
```

Generated files:

- `data/generated/cards.json`
- `data/generated/characters.json`
- `data/generated/master_refs.json`
- `data/generated/manifest.json`

Every normalized card keeps the original upstream card ID and master version so changes can be diffed reliably.

## Local sync

Python 3.11 or newer is required.

```bash
python -m pip install -e . pytest
pytest
holodori-sync --force
```

`holodori-sync` downloads the explicit allow-list of master tables, normalizes them and writes the generated JSON files. Without `--force`, a download is skipped only when the recorded master version is unchanged **and** the complete raw cache is present.

## Automated validation

`.github/workflows/sync-master-data.yml` runs on pull requests, on a six-hour schedule and by manual dispatch.

Pull requests perform a full upstream download and validate that:

- normalized card data is non-empty
- card and manifest counts agree
- leader cards are present
- Juufuutei Raden (`chr-06004`) has the expected R3/R4/R5 card and leader coverage
- referenced active skills have level data

Scheduled/manual runs additionally commit changed normalized output back to the branch.

## Upstream boundary

The upstream repository is treated as master-data input, not as application code. `src/holodori_decksim/sources.py` contains an explicit file allow-list so upstream schema additions require review before they enter the simulator pipeline.

The next milestone after this bootstrap is to connect the normalized card database to the six-slot deck model (1 leader + 5 members), then layer user-owned breakthrough state and score calculation on top.
