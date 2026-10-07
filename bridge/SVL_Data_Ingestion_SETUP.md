# Persistent Data Ingestion — one-time bridge setup

The source of truth is the repository version of:
- `SVL_Google_Bridge.gs`
- `SVL_Data_Ingestion.gs`

## One-time install

1. Open the Apps Script project bound to `Sports_Value_Lab_Registro_CURRENT`.
2. Add a script file named `SVL_Data_Ingestion.gs` and paste the repository file.
3. Replace the bridge file with the current repository `SVL_Google_Bridge.gs`.
4. Set the Apps Script project timezone to `America/Mexico_City`.
5. Save and deploy a new Web App version.
6. Run `svlInstallDailyIngestionTrigger()` once from the editor and grant UrlFetch + Drive permissions.

The daily trigger runs around 11:00 in the script timezone. It is idempotent at the source-byte level: identical source hashes reuse the same immutable snapshot while CURRENT and run manifests are refreshed.

## Manual/API smoke test

POST to the bridge Web App with the existing bridge token:

```json
{"command":"ingest","sport":"NFL"}
```

Expected result:
- `status` is `CURRENT_VALID` or `PROVISIONAL_VALID`;
- no missing completed game IDs;
- NFL `DATA/.../ingestion/CURRENT` contains `games.csv`, `play_by_play_2026.csv.gz`, and `NFL_INGESTION_CURRENT.json`;
- snapshots/manifests contain immutable audit artifacts;
- no odds request and no pick-register write occurs.
