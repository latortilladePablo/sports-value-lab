# NFL PBP Weekly Automation

## Primary path — Google Apps Script / Drive

The canonical ingestion source for the Quiniela Brewers NFL model pipeline is the existing Sports Value Lab Google Apps Script output in Drive:

`Sports Value Lab / NFL / ingestion / CURRENT`

Canonical files:
- `play_by_play_2026.csv.gz`
- `games.csv`
- `NFL_INGESTION_CURRENT.json`

The manifest must prove:
- current season = 2026;
- latest completed week is sufficient for the target week;
- completed-games coverage is complete;
- `missing_game_ids=[]`;
- PBP SHA-256 is persisted;
- immutable snapshot is also written under `ingestion/snapshots`.

QB0/QB1 MODEL READINESS should read this Drive manifest first. If valid, use the CURRENT Drive PBP directly to build the target-week feature snapshot. Do not ask the user to upload the file manually.

## Fallback path — GitHub Actions

Workflow:
`.github/workflows/nfl-pbp-refresh.yml`

This is now **manual fallback only** via `workflow_dispatch`.
It downloads the same nflverse asset, verifies gzip integrity and SHA-256, then publishes `nfl-pbp-current-2026` as an Actions artifact.

Use fallback only if the Apps Script / Drive ingestion is stale, incomplete, missing, or fails hash/coverage checks.

## Model rules
- No model refit.
- PBP is lagged only: completed games may feed future games, never the target game's own PBP.
- `P_ML` remains the frozen Elo component.
- `P_MARGIN` is generated only after the exact Week-X feature snapshot passes schema/leakage/home-away/timestamp checks.
