# NFL PBP Weekly Automation

This repository refreshes the current-season nflverse play-by-play asset automatically for the Quiniela Brewers NFL model pipeline.

## Workflow
- Workflow: `.github/workflows/nfl-pbp-refresh.yml`
- Upstream: `nflverse/nflverse-data`, release tag `pbp`
- Asset: `play_by_play_2026.csv.gz`
- Scheduled runs:
  - Tuesday 19:30 UTC (13:30 America/Mexico_City)
  - Wednesday 07:30 UTC (01:30 America/Mexico_City) fallback
- Manual trigger: `workflow_dispatch`

Each run:
1. downloads the current 2026 PBP asset;
2. checks gzip integrity;
3. reads the release metadata;
4. verifies SHA-256 when the upstream digest is published;
5. writes `manifest.json`;
6. publishes GitHub Actions artifact `nfl-pbp-current-2026`.

## ChatGPT / Drive bridge
A recurring ChatGPT condition-watch checks Tuesday/Wednesday for a new successful workflow artifact. When a new SHA appears, it downloads the artifact and syncs it into:

`Sports Value Lab/MODELS/NFL/v2/live/NFL_PBP_CURRENT_artifact.zip`

The weekly QB0/QB1 model-readiness gate should use that Drive artifact rather than ask for a manual upload.

## Safety
- No model refit.
- PBP is lagged only: completed games may feed future games, never the target game's own PBP.
- `P_ML` remains the frozen Elo component.
- `P_MARGIN` is generated only after the exact Week-X feature snapshot passes schema/leakage checks.
