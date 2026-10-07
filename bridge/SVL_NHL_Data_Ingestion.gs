/**
 * SPORTS VALUE LAB — NHL Persistent Data Ingestion v1.0
 * SportsDataverse / fastRhockey CURRENT adapter.
 * No odds, model, pick-register or refit operations.
 */

const SVL_NHL_SOURCES = [
  { key:"schedule", tag:"nhl_schedules", file:"nhl_schedule_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_schedules/nhl_schedule_2027.csv",
    sha256:"dbf51b08466532eab8e37b42437701e60a4cc311fbd672666aa463be3393760f", size:267412, updated_at:"2026-10-07T08:04:01Z" },
  { key:"game_rosters", tag:"nhl_game_rosters", file:"game_rosters_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_game_rosters/game_rosters_2027.csv",
    sha256:"4f2367a7ebc64a80b1fb122b2fa9fbcd1f719c9d541f09c137bcd9a2c5e0721f", size:168943, updated_at:"2026-10-07T08:02:20Z" },
  { key:"team_box", tag:"nhl_team_boxscores", file:"team_box_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_team_boxscores/team_box_2027.csv",
    sha256:"b8268afccc5f2fccc3fcaa452d4d7c434cb4563c5b375a5fb285c5d29495b97b", size:9519, updated_at:"2026-10-07T08:02:02Z" },
  { key:"player_box", tag:"nhl_player_boxscores", file:"player_box_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_player_boxscores/player_box_2027.csv",
    sha256:"c9e488281d1f374a2662289e853d7d45d38aeb5b514677dbfac242063ebcc91d", size:243788, updated_at:"2026-10-07T08:03:52Z" },
  { key:"pbp_lite", tag:"nhl_pbp_lite", file:"play_by_play_lite_2027.csv", required:true,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_pbp_lite/play_by_play_lite_2027.csv",
    sha256:"a442abdb6465f20af2bf14caefcb58d48f7093bebd760768444eccd6a53e687c", size:9597714, updated_at:"2026-10-07T08:03:42Z" },
  { key:"scratches", tag:"nhl_scratches", file:"scratches_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_scratches/scratches_2027.csv",
    sha256:"669694a46bacd93093b6a8d8d6d2268db35d2fec51d600dc2a06e1b2bc102ec5", size:9253, updated_at:"2026-10-07T08:02:57Z" },
  { key:"shifts", tag:"nhl_shifts", file:"shifts_2027.csv", required:false, enabled:false,
    url:"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nhl_shifts/shifts_2027.csv",
    sha256:"6546c1d2b5aaeb6df177f5e10d0ef5f2e84c3893028055c70bddaa7dbc03b909", size:4049982, updated_at:"2026-10-07T08:02:29Z" }
];

function svlIngestNHL_() {
  const cfg = SVL_INGESTION.SPORTS.NHL;
  const now = new Date();
  const retrievedAt = now.toISOString();
  const stored = {};
  const failures = [];

  SVL_NHL_SOURCES.forEach(function(src) {
    if (src.enabled === false) return;
    try {
      const rel = svlNHLReleaseAsset_(src);
      const resp = UrlFetchApp.fetch(rel.browser_download_url, {
        method:"get", followRedirects:true, muteHttpExceptions:true,
        headers:{"User-Agent":"SportsValueLab/1.0"}
      });
      svlRequire2xx_(resp, "NHL " + src.key);
      const blob = resp.getBlob().setName(src.file);
      const bytes = blob.getBytes();
      const sha = svlSha256Bytes_(bytes);
      const expected = String(rel.digest || "").replace(/^sha256:/i,"").toLowerCase();
      if (expected && expected !== sha) throw new Error(src.key + " SHA mismatch");
      if (rel.size && Number(rel.size) !== bytes.length) throw new Error(src.key + " size mismatch");

      const text = blob.getDataAsString("UTF-8");
      const coverage = svlNHLCoverage_(src.key, text);
      const ageHours = rel.updated_at ? (now.getTime() - new Date(rel.updated_at).getTime())/3600000 : null;
      let state = coverage.status === "INCOMPLETE" ? "INCOMPLETE" :
        (ageHours !== null && ageHours < 36 ? "PROVISIONAL_VALID" : "CURRENT_VALID");

      const item = svlStoreSource_({
        folders: cfg.folders, sport:"NHL", sourceKey:src.key, fileName:src.file,
        blob:blob, sha256:sha, retrievedAt:retrievedAt, updatedAt:rel.updated_at,
        sourceUrl:rel.browser_download_url, state:state, coverage:coverage
      });
      stored[src.key] = item.manifest;
    } catch (err) {
      failures.push({source_key:src.key, required:src.required, error:String(err && err.message ? err.message : err)});
    }
  });

  const requiredMissing = failures.filter(function(x){ return x.required; });
  const states = Object.keys(stored).map(function(k){ return stored[k].status; });
  const overall = requiredMissing.length ? "INCOMPLETE" :
    (states.indexOf("INCOMPLETE") >= 0 ? "INCOMPLETE" :
      (states.indexOf("PROVISIONAL_VALID") >= 0 ? "PROVISIONAL_VALID" : "CURRENT_VALID"));

  const manifest = {
    schema:"Sports Value Lab Data Ingestion Manifest v1",
    ingestion_version:SVL_INGESTION.VERSION,
    sport:"NHL", season_end_year:cfg.seasonEndYear,
    retrieved_at:retrievedAt, status:overall,
    sources:stored,
    unavailable_optional:{
      season_rosters_2027:{
        status:"INCOMPLETE",
        reason:"sportsdataverse nhl_rosters release has no 2027 asset at adapter freeze; use game_rosters_2027 for CURRENT dressed-player coverage."
      }
    },
    failures:failures,
    reconciliation:{
      primary_structured:"SportsDataverse fastRhockey releases",
      operational:"Hockey-Reference Schedule and Results",
      crosscheck:"ESPN NHL Scoreboard",
      official_verification:"NHL.com GameCenter/Schedule"
    },
    controls:{odds_requested:false,pick_register_modified:false,model_modified:false,immutable_snapshot_policy:true,current_pointer_written:true}
  };
  const m = svlStoreJsonManifest_(cfg.folders, "NHL_INGESTION", manifest, now);
  return {ok:overall!=="INCOMPLETE",sport:"NHL",status:overall,manifest:m,source_count:Object.keys(stored).length,failures:failures};
}

function svlNHLReleaseAsset_(src) {
  return {
    browser_download_url: src.url,
    digest: "sha256:" + src.sha256,
    size: src.size,
    updated_at: src.updated_at
  };
}

function svlNHLCoverage_(sourceKey, csvText) {
  const rows = Utilities.parseCsv(csvText);
  if (!rows || rows.length < 2) return {status:"INCOMPLETE",rows:Math.max(0,(rows||[]).length-1),reason:"empty"};
  const h = {};
  rows[0].forEach(function(v,i){ h[String(v).toLowerCase()] = i; });
  const idNames = ["game_id","gameid","id"];
  let idCol = null;
  for (let i=0;i<idNames.length;i++) if (h[idNames[i]] !== undefined) { idCol=h[idNames[i]]; break; }
  const ids = {};
  if (idCol !== null) rows.slice(1).forEach(function(r){ const v=String(r[idCol]||"").trim(); if(v) ids[v]=true; });
  return {
    status:"CURRENT_VALID",
    rows:rows.length-1,
    distinct_game_ids:Object.keys(ids).length,
    schema_columns:rows[0].length,
    source_key:sourceKey
  };
}

function svlNHLPreflight() {
  const cfg = SVL_INGESTION.SPORTS.NHL;
  const current = DriveApp.getFolderById(cfg.folders.current);
  const mf = svlFindByName_(current, "NHL_INGESTION_CURRENT.json");
  if (!mf) return {ok:false,status:"INCOMPLETE",blockers:["NHL_INGESTION_CURRENT.json missing"]};
  const j = JSON.parse(mf.getBlob().getDataAsString("UTF-8"));
  const blockers = [];
  SVL_NHL_SOURCES.filter(function(x){return x.required;}).forEach(function(src){
    const x = j.sources && j.sources[src.key];
    if (!x || x.status === "INCOMPLETE") blockers.push(src.key);
  });
  return {ok:blockers.length===0,status:blockers.length?"INCOMPLETE":j.status,blockers:blockers,manifest_file_id:mf.getId()};
}
