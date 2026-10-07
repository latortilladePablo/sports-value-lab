/**
 * SPORTS VALUE LAB — NHL Persistent Data Ingestion v1.0
 * SportsDataverse / fastRhockey CURRENT adapter.
 * No odds, model, pick-register or refit operations.
 */

const SVL_NHL_SOURCES = [
  { key:"schedule", tag:"nhl_schedules", file:"nhl_schedule_2027.csv", required:true },
  { key:"game_rosters", tag:"nhl_game_rosters", file:"game_rosters_2027.csv", required:true },
  { key:"team_box", tag:"nhl_team_boxscores", file:"team_box_2027.csv", required:true },
  { key:"player_box", tag:"nhl_player_boxscores", file:"player_box_2027.csv", required:true },
  { key:"pbp_lite", tag:"nhl_pbp_lite", file:"play_by_play_lite_2027.csv", required:true },
  { key:"scratches", tag:"nhl_scratches", file:"scratches_2027.csv", required:false },
  { key:"shifts", tag:"nhl_shifts", file:"shifts_2027.csv", required:false }
];

function svlIngestNHL_() {
  const cfg = SVL_INGESTION.SPORTS.NHL;
  const now = new Date();
  const retrievedAt = now.toISOString();
  const stored = {};
  const failures = [];

  SVL_NHL_SOURCES.forEach(function(src) {
    try {
      const rel = svlNHLReleaseAsset_(src.tag, src.file);
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

function svlNHLReleaseAsset_(tag, fileName) {
  const api = "https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/" + encodeURIComponent(tag);
  const r = UrlFetchApp.fetch(api, {
    method:"get", followRedirects:true, muteHttpExceptions:true,
    headers:{"Accept":"application/vnd.github+json","User-Agent":"SportsValueLab/1.0"}
  });
  svlRequire2xx_(r, "NHL release metadata " + tag);
  const j = JSON.parse(r.getContentText());
  const a = (j.assets || []).filter(function(x){ return x.name === fileName; })[0];
  if (!a) throw new Error("asset_not_found " + tag + "/" + fileName);
  return a;
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
