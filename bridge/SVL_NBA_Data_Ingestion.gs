/**
 * SPORTS VALUE LAB — NBA Persistent Data Ingestion v1.0
 * Canonical machine-readable CURRENT source: SportsDataverse / hoopR ESPN NBA releases.
 *
 * P5 policy:
 * - schedule is the required weekly structured source;
 * - team/player boxscores, PBP and game rosters are optional structured enrichment
 *   and become CURRENT automatically when the season-end-year asset exists;
 * - Basketball-Reference = operational reconciliation;
 * - ESPN Scoreboard = cross-check;
 * - NBA.com = official discrepancy/OT/correction verification.
 *
 * No odds, models, feature builders, picks or register writes.
 */

const SVL_NBA_SOURCES = [
  { key:"schedule", tag:"espn_nba_schedules", file:"nba_schedule_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_schedules/nba_schedule_2027.csv",
    sha256:"9e07665fb1e2982150baf305b4bf8fab20157f55a316225a2ef0fcbbe5d6eb68", size:1503859, updated_at:"2026-10-06T12:14:58Z" },
  { key:"team_box", tag:"espn_nba_team_boxscores", file:"team_box_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_team_boxscores/team_box_2027.csv" },
  { key:"player_box", tag:"espn_nba_player_boxscores", file:"player_box_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_2027.csv" },
  { key:"pbp", tag:"espn_nba_pbp", file:"play_by_play_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_pbp/play_by_play_2027.csv" },
  { key:"game_rosters", tag:"espn_nba_game_rosters", file:"game_rosters_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_game_rosters/game_rosters_2027.csv" }
];

function svlIngestNBA_() {
  const cfg = SVL_INGESTION.SPORTS.NBA;
  const now = new Date();
  const retrievedAt = now.toISOString();
  const stored = {};
  const unavailable = [];
  const failures = [];

  SVL_NBA_SOURCES.forEach(function(src) {
    if (src.enabled === false) {
      unavailable.push({
        source_key:src.key, required:false, status:"NOT_REQUESTED",
        reason:"optional_source_not_required_for_current_P5_refresh"
      });
      return;
    }
    try {
      const rel = svlNBAReleaseAsset_(src);
      if (!rel) {
        unavailable.push({
          source_key:src.key,
          required:src.required,
          status:"INCOMPLETE",
          reason:"season_asset_not_published",
          tag:src.tag,
          expected_file:src.file
        });
        return;
      }

      const resp = UrlFetchApp.fetch(rel.browser_download_url, {
        method:"get",
        followRedirects:true,
        muteHttpExceptions:true,
        headers:{"User-Agent":"SportsValueLab/1.0"}
      });
      svlRequire2xx_(resp, "NBA " + src.key);
      const blob = resp.getBlob().setName(src.file);
      const bytes = blob.getBytes();
      const sha = svlSha256Bytes_(bytes);
      const expected = String(rel.digest || "").replace(/^sha256:/i,"").toLowerCase();

      if (expected && expected !== sha) {
        throw new Error(src.key + " SHA256 mismatch: got " + sha + " expected " + expected);
      }
      if (rel.size && Number(rel.size) !== bytes.length) {
        throw new Error(src.key + " size mismatch: got " + bytes.length + " expected " + rel.size);
      }

      const text = blob.getDataAsString("UTF-8");
      const coverage = svlNBACoverage_(src.key, text);
      if (coverage.status === "INCOMPLETE") {
        throw new Error(src.key + " coverage validation failed: " + JSON.stringify(coverage));
      }

      const ageHours = rel.updated_at
        ? (now.getTime() - new Date(rel.updated_at).getTime()) / 3600000
        : null;
      const state = ageHours !== null && ageHours < 36
        ? "PROVISIONAL_VALID"
        : "CURRENT_VALID";

      const item = svlStoreSource_({
        folders:cfg.folders,
        sport:"NBA",
        sourceKey:src.key,
        fileName:src.file,
        blob:blob,
        sha256:sha,
        retrievedAt:retrievedAt,
        updatedAt:rel.updated_at,
        sourceUrl:rel.browser_download_url,
        state:state,
        coverage:coverage
      });
      stored[src.key] = item.manifest;
    } catch (err) {
      failures.push({
        source_key:src.key,
        required:src.required,
        error:String(err && err.message ? err.message : err)
      });
    }
  });

  const requiredFailures = failures.filter(function(x){ return x.required; });
  const requiredUnavailable = unavailable.filter(function(x){ return x.required; });
  const schedule = stored.schedule || null;

  let overall = "CURRENT_VALID";
  if (requiredFailures.length || requiredUnavailable.length || !schedule) {
    overall = "INCOMPLETE";
  } else if (schedule.status === "PROVISIONAL_VALID") {
    overall = "PROVISIONAL_VALID";
  }

  const manifest = {
    schema:"Sports Value Lab Data Ingestion Manifest v1",
    ingestion_version:SVL_INGESTION.VERSION,
    sport:"NBA",
    season_end_year:cfg.seasonEndYear,
    retrieved_at:retrievedAt,
    status:overall,
    sources:stored,
    unavailable_optional:unavailable.filter(function(x){ return !x.required; }),
    failures:failures,
    coverage:schedule ? schedule.coverage : null,
    p5_contract:{
      structured_current:"SportsDataverse sportsdataverse-data ESPN NBA family (hoopR-nba-raw -> hoopR-nba-data)",
      required_weekly_source:"espn_nba_schedules / nba_schedule_2027.csv",
      optional_enrichment:["espn_nba_team_boxscores","espn_nba_player_boxscores","espn_nba_pbp","espn_nba_game_rosters"],
      reconciliation:"Basketball-Reference Schedule and Results",
      crosscheck:"ESPN NBA Scoreboard",
      official_verification:"NBA.com Schedule/Game/Box Score",
      season_scope:"NBA regular season; downstream P5 filters non-regular-season rows",
      zero_results_rule:"If regular season has not begun, zero P5 updates is valid."
    },
    controls:{
      odds_requested:false,
      pick_register_modified:false,
      model_modified:false,
      features_modified:false,
      immutable_snapshot_policy:true,
      current_pointer_written:true
    }
  };

  const m = svlStoreJsonManifest_(cfg.folders, "NBA_INGESTION", manifest, now);
  return {
    ok:overall !== "INCOMPLETE",
    sport:"NBA",
    status:overall,
    manifest:m,
    sources_written:Object.keys(stored),
    unavailable_optional:manifest.unavailable_optional,
    failures:failures
  };
}

function svlNBAReleaseAsset_(src) {
  return {
    browser_download_url: src.url,
    digest: src.sha256 ? "sha256:" + src.sha256 : null,
    size: src.size || null,
    updated_at: src.updated_at || null
  };
}

function svlNBACoverage_(sourceKey, csvText) {
  const rows = Utilities.parseCsv(csvText);
  if (!rows || rows.length < 2) {
    return {status:"INCOMPLETE",rows:Math.max(0,(rows || []).length - 1),reason:"empty"};
  }

  const headers = rows[0].map(function(x){ return String(x || "").trim(); });
  const lower = headers.map(function(x){ return x.toLowerCase(); });
  const findAny = function(names) {
    for (let i=0;i<names.length;i++) {
      const idx = lower.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idCol = findAny(["game_id","gameid","event_id","id"]);
  if (idCol < 0) {
    return {status:"INCOMPLETE",rows:rows.length-1,reason:"game_id_column_not_detected",headers:headers.slice(0,80)};
  }

  const ids = {};
  rows.slice(1).forEach(function(r) {
    const v = String(r[idCol] || "").trim();
    if (v) ids[v] = true;
  });

  if (!Object.keys(ids).length) {
    return {status:"INCOMPLETE",rows:rows.length-1,reason:"no_nonempty_game_ids"};
  }

  const statusCol = findAny(["status_type_completed","status_completed","completed"]);
  let completedRows = null;
  if (statusCol >= 0) {
    completedRows = rows.slice(1).filter(function(r) {
      return /^(true|1|completed|final)$/i.test(String(r[statusCol] || "").trim());
    }).length;
  }

  return {
    status:"CURRENT_VALID",
    source_key:sourceKey,
    rows:rows.length-1,
    schema_columns:headers.length,
    distinct_game_ids:Object.keys(ids).length,
    completed_rows:completedRows,
    detected_game_id_column:headers[idCol]
  };
}

function svlNBAPreflight() {
  const cfg = SVL_INGESTION.SPORTS.NBA;
  const current = DriveApp.getFolderById(cfg.folders.current);
  const mf = svlFindByName_(current, "NBA_INGESTION_CURRENT.json");
  if (!mf) {
    return {ok:false,status:"INCOMPLETE",blockers:["NBA_INGESTION_CURRENT.json missing"]};
  }

  const j = JSON.parse(mf.getBlob().getDataAsString("UTF-8"));
  const blockers = [];
  if (!j.sources || !j.sources.schedule) blockers.push("schedule_missing");
  if (j.sources && j.sources.schedule && j.sources.schedule.status === "INCOMPLETE") blockers.push("schedule_incomplete");

  return {
    ok:blockers.length===0,
    status:blockers.length ? "INCOMPLETE" : j.status,
    blockers:blockers,
    optional_unavailable:j.unavailable_optional || [],
    manifest_file_id:mf.getId()
  };
}
