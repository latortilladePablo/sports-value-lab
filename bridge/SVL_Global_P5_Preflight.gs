/**
 * SPORTS VALUE LAB — Global P5/Data Ingestion/Preflight v1.0
 *
 * Read-only P5 consumption layer over per-sport CURRENT manifests.
 * Does not fetch odds, write Picks, or modify models/features.
 */

const SVL_P5_GLOBAL = {
  VERSION: "v1.0",
  STATES: ["CURRENT_VALID","PROVISIONAL_VALID","INCOMPLETE"],
  SPORTS: {
    NFL: {
      manifest:"NFL_INGESTION_CURRENT.json",
      required_sources:["schedule","pbp"]
    },
    NBA: {
      manifest:"NBA_INGESTION_CURRENT.json",
      required_sources:["schedule"]
    },
    NHL: {
      manifest:"NHL_INGESTION_CURRENT.json",
      required_sources:["schedule","game_rosters","team_box","player_box","pbp_lite"]
    },
    SOCCER: {
      manifest:"SOCCER_INGESTION_CURRENT.json",
      required_sources:["espn_incremental","normalized_events"]
    },
    TENNIS: {
      manifest:"TENNIS_INGESTION_CURRENT.json",
      required_sources:["atp_official","wta_official","normalized_events"]
    }
  }
};

function svlGlobalP5Preflight() {
  const checkedAt = new Date().toISOString();
  const rows = Object.keys(SVL_P5_GLOBAL.SPORTS).map(function(sport) {
    return svlP5CheckSport_(sport);
  });
  const blocked = rows.filter(function(r){ return r.readiness === "BLOCKED"; });
  return {
    ok:blocked.length === 0,
    version:SVL_P5_GLOBAL.VERSION,
    checked_at:checkedAt,
    policy:{
      season_data:"DATA/<sport>/ingestion via per-sport configured Drive folders",
      odds:"ODDS_ARCHIVE only when prospectively used; global P5 layer never requests/writes odds",
      picks:"Sports_Value_Lab_Registro_CURRENT / Picks is read/write isolated from P5; this layer never opens it",
      models:"no model or feature mutation",
      manual_uploads:"not part of P5 steady-state; P5 consumes CURRENT manifests"
    },
    matrix:rows,
    ready_sports:rows.filter(function(r){return r.readiness==="READY";}).map(function(r){return r.sport;}),
    blocked_sports:blocked.map(function(r){return r.sport;})
  };
}

function svlP5ManifestContext() {
  const pf = svlGlobalP5Preflight();
  return {
    ok:pf.ok,
    checked_at:pf.checked_at,
    manual_upload_required:false,
    sports:pf.matrix.map(function(r) {
      return {
        sport:r.sport,
        readiness:r.readiness,
        state:r.state,
        causes:r.causes,
        cutoff:r.cutoff,
        coverage:r.coverage,
        manifest_file_id:r.manifest_file_id
      };
    }),
    controls:pf.policy
  };
}

/**
 * Non-mutating dry-run: reads CURRENT manifests/folders only.
 * No network source refresh and no Drive writes.
 */
function svlGlobalP5DryRun() {
  const pf = svlGlobalP5Preflight();
  return {
    ok:pf.ok,
    mode:"DRY_RUN_READ_ONLY",
    mutation:false,
    network_fetch:false,
    result:pf
  };
}

function svlP5CheckSport_(sport) {
  const sc = SVL_P5_GLOBAL.SPORTS[sport];
  const cfg = SVL_INGESTION.SPORTS[sport];
  const causes = [];
  if (!cfg || !cfg.folders) {
    return {sport:sport,readiness:"BLOCKED",state:"INCOMPLETE",causes:["sport_config_missing"]};
  }

  let mf = null;
  let manifest = null;
  try {
    const folder = DriveApp.getFolderById(cfg.folders.current);
    mf = svlFindByName_(folder, sc.manifest);
    if (!mf) causes.push("manifest_missing:" + sc.manifest);
    else manifest = JSON.parse(mf.getBlob().getDataAsString("UTF-8"));
  } catch (e) {
    causes.push("manifest_read_error:" + String(e && e.message ? e.message : e));
  }

  if (!manifest) {
    return {
      sport:sport,
      readiness:"BLOCKED",
      state:"INCOMPLETE",
      causes:causes,
      manifest_file_id:mf ? mf.getId() : null,
      coverage:null,
      cutoff:null
    };
  }

  const state = SVL_P5_GLOBAL.STATES.indexOf(manifest.status) >= 0
    ? manifest.status
    : "INCOMPLETE";
  if (state === "INCOMPLETE") causes.push("manifest_status:INCOMPLETE");
  if (SVL_P5_GLOBAL.STATES.indexOf(manifest.status) < 0) causes.push("invalid_manifest_status:" + String(manifest.status));

  const sources = manifest.sources || {};
  (sc.required_sources || []).forEach(function(key) {
    const x = sources[key];
    if (!x) causes.push("required_source_missing:" + key);
    else if (x.status === "INCOMPLETE") causes.push("required_source_incomplete:" + key);
  });

  (manifest.failures || []).forEach(function(f) {
    if (f.required === false) return;
    causes.push("failure:" + svlP5FailureText_(f));
  });

  if (sport === "SOCCER") {
    const cv = manifest.coverage || {};
    if (Number(cv.requests_expected || 0) > 0 && Number(cv.requests_ok || 0) !== Number(cv.requests_expected || 0)) {
      causes.push("soccer_requests_ok:" + Number(cv.requests_ok || 0) + "/" + Number(cv.requests_expected || 0));
    }
  }

  if (sport === "TENNIS") {
    const cv = manifest.coverage || {};
    if (Number(cv.atp_events_current || 0) <= 0) causes.push("tennis_atp_coverage_zero");
    if (Number(cv.wta_events_current || 0) <= 0) causes.push("tennis_wta_coverage_zero");
  }

  const controls = manifest.controls || {};
  if (controls.odds_requested === true) causes.push("policy_violation:odds_requested");
  if (controls.pick_register_modified === true) causes.push("policy_violation:pick_register_modified");
  if (controls.model_modified === true) causes.push("policy_violation:model_modified");
  if (controls.features_modified === true) causes.push("policy_violation:features_modified");

  const hard = causes.filter(function(x) {
    return !/^failure:.*required=false/.test(x);
  });
  const readiness = state !== "INCOMPLETE" && hard.length === 0 ? "READY" : "BLOCKED";

  return {
    sport:sport,
    readiness:readiness,
    state:state,
    causes:causes.length ? causes : ["none"],
    retrieved_at:manifest.retrieved_at || null,
    cutoff:manifest.cutoff_ymd || manifest.season_end_year || (manifest.coverage && manifest.coverage.season) || null,
    coverage:manifest.coverage || null,
    manifest_file_id:mf ? mf.getId() : null,
    controls:{
      odds_requested:controls.odds_requested === true,
      pick_register_modified:controls.pick_register_modified === true,
      model_modified:controls.model_modified === true,
      features_modified:controls.features_modified === true
    }
  };
}

function svlP5FailureText_(f) {
  const parts = [];
  ["source_key","tour","stage","league","date","http_code","error","reason"].forEach(function(k) {
    if (f && f[k] !== undefined && f[k] !== null && String(f[k]) !== "") parts.push(k + "=" + String(f[k]).slice(0,240));
  });
  return parts.join("|") || JSON.stringify(f).slice(0,500);
}
