/**
 * SPORTS VALUE LAB — Soccer Persistent P5 Ingestion v1.0
 * CURRENT leagues: ENG.1, ESP.1, ESP.2, GER.1, ITA.1, MEX.1.
 *
 * Machine-readable source:
 * https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates=YYYYMMDD
 *
 * P5 keeps 90m regulation score separate from extra time / penalties.
 * Official competition sites are captured for discrepancies, postponements,
 * cancellations, score/date corrections, and special resolutions.
 *
 * No models, feature builders, picks, register or odds are modified.
 */

const SVL_SOCCER = {
  schemaVersion: "soccer_p5_normalized_v1",
  overlapDays: 7,
  fetchBatchSize: 50,
  leagues: [
    { code:"ENG.1", espn:"eng.1", name:"Premier League", official:"https://www.premierleague.com/en/matches/premier-league/" },
    { code:"ESP.1", espn:"esp.1", name:"LaLiga EA SPORTS", official:"https://www.laliga.com/laliga-easports/resultados" },
    { code:"ESP.2", espn:"esp.2", name:"LaLiga Hypermotion", official:"https://www.laliga.com/laliga-hypermotion/resultados" },
    { code:"GER.1", espn:"ger.1", name:"Bundesliga", official:"https://www.bundesliga.com/en/bundesliga/matchday" },
    { code:"ITA.1", espn:"ita.1", name:"Serie A", official:"https://www.legaseriea.it/serie-a/calendario-risultati" },
    { code:"MEX.1", espn:"mex.1", name:"Liga MX", official:"https://ligamx.net/cancha/partidos" }
  ]
};

function svlIngestSoccer_() {
  const cfg = SVL_INGESTION.SPORTS.SOCCER;
  const now = new Date();
  const retrievedAt = now.toISOString();
  const seasonStart = svlSoccerSeasonStart_(now);
  const prior = svlSoccerReadCurrentManifest_(cfg.folders);
  const priorEvents = svlSoccerReadCurrentEvents_(cfg.folders);

  let from = seasonStart;
  if (prior && prior.cutoff_ymd) {
    const d = svlSoccerParseYmd_(prior.cutoff_ymd);
    d.setUTCDate(d.getUTCDate() - SVL_SOCCER.overlapDays);
    if (d > seasonStart) from = d;
  }
  const to = svlSoccerTodayUtcDate_(now);
  const dates = svlSoccerDateRange_(from, to);

  const specs = [];
  SVL_SOCCER.leagues.forEach(function(lg) {
    dates.forEach(function(d) {
      const ymd = svlSoccerYmd_(d);
      specs.push({
        league:lg,
        ymd:ymd,
        url:"https://site.api.espn.com/apis/site/v2/sports/soccer/" + lg.espn + "/scoreboard?dates=" + ymd
      });
    });
  });

  const responseRecords = [];
  const failures = [];
  const pulledEvents = [];
  for (let i=0; i<specs.length; i += SVL_SOCCER.fetchBatchSize) {
    const batch = specs.slice(i, i + SVL_SOCCER.fetchBatchSize);
    const reqs = batch.map(function(s) {
      return {
        url:s.url,
        method:"get",
        followRedirects:true,
        muteHttpExceptions:true,
        headers:{"User-Agent":"SportsValueLab/1.0","Accept":"application/json"}
      };
    });
    const responses = UrlFetchApp.fetchAll(reqs);
    responses.forEach(function(resp, idx) {
      const spec = batch[idx];
      const code = resp.getResponseCode();
      const blob = resp.getBlob();
      const bytes = blob.getBytes();
      const sha = svlSha256Bytes_(bytes);
      const rec = {
        league:spec.league.code,
        date:spec.ymd,
        source_url:spec.url,
        http_code:code,
        sha256:sha,
        size_bytes:bytes.length,
        retrieved_at:retrievedAt
      };
      if (code < 200 || code >= 300) {
        rec.status = "INCOMPLETE";
        failures.push({league:spec.league.code,date:spec.ymd,url:spec.url,http_code:code});
        responseRecords.push(rec);
        return;
      }
      try {
        const payload = JSON.parse(resp.getContentText());
        if (!Array.isArray(payload.events)) throw new Error("events_not_array");
        rec.status = "CURRENT_VALID";
        rec.events_count = payload.events.length;
        rec.payload = { leagues:payload.leagues || [], events:payload.events };
        payload.events.forEach(function(ev) {
          const norm = svlSoccerNormalizeEvent_(spec.league, ev, spec.url, retrievedAt);
          if (norm) pulledEvents.push(norm);
        });
      } catch (err) {
        rec.status = "INCOMPLETE";
        rec.error = String(err && err.message ? err.message : err);
        failures.push({league:spec.league.code,date:spec.ymd,url:spec.url,error:rec.error});
      }
      responseRecords.push(rec);
    });
  }

  const oldMap = {};
  priorEvents.forEach(function(e){ if (e.event_id) oldMap[e.event_id] = e; });
  const merged = {};
  priorEvents.forEach(function(e) {
    if (e.event_id && (!e.date_utc || new Date(e.date_utc) >= seasonStart)) merged[e.event_id] = e;
  });

  const verification = [];
  pulledEvents.forEach(function(e) {
    const old = oldMap[e.event_id] || null;
    const reasons = svlSoccerVerificationReasons_(old, e);
    if (reasons.length) {
      e.official_verification_required = true;
      e.official_verification_reasons = reasons;
      verification.push({
        event_id:e.event_id,
        league:e.league,
        date_utc:e.date_utc,
        home:e.home_team,
        away:e.away_team,
        reasons:reasons,
        official_url:e.official_verification_url
      });
    } else {
      e.official_verification_required = false;
      e.official_verification_reasons = [];
    }
    merged[e.event_id] = e;
  });

  const currentEvents = Object.keys(merged).map(function(k){ return merged[k]; })
    .sort(function(a,b){ return String(a.date_utc).localeCompare(String(b.date_utc)); });

  const officialEvidence = svlSoccerFetchOfficialEvidence_(verification, retrievedAt);

  const rawObj = {
    schema:"SVL Soccer ESPN Incremental Raw v1",
    from_ymd:svlSoccerYmd_(from),
    to_ymd:svlSoccerYmd_(to),
    retrieved_at:retrievedAt,
    endpoint_template:"https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates=YYYYMMDD",
    responses:responseRecords
  };
  const rawBlob = Utilities.newBlob(JSON.stringify(rawObj), "application/json", "SOCCER_ESPN_INCREMENTAL_CURRENT.json");
  const rawSha = svlSha256Bytes_(rawBlob.getBytes());

  const leagueCoverage = {};
  SVL_SOCCER.leagues.forEach(function(lg) {
    const ev = currentEvents.filter(function(x){ return x.league === lg.code; });
    leagueCoverage[lg.code] = {
      events_total:ev.length,
      final:ev.filter(function(x){return x.status_class === "FINAL";}).length,
      postponed:ev.filter(function(x){return x.status_class === "POSTPONED";}).length,
      cancelled:ev.filter(function(x){return x.status_class === "CANCELLED";}).length,
      unresolved_regulation:ev.filter(function(x){return x.status_class === "FINAL" && (x.regulation_90_home === null || x.regulation_90_away === null);}).length
    };
  });

  const coverage = {
    from_ymd:svlSoccerYmd_(from),
    to_ymd:svlSoccerYmd_(to),
    requests_expected:specs.length,
    requests_ok:responseRecords.filter(function(r){return r.status === "CURRENT_VALID";}).length,
    requests_failed:failures.length,
    distinct_events_current:currentEvents.length,
    final_events_current:currentEvents.filter(function(x){return x.status_class === "FINAL";}).length,
    verification_queue:verification.length,
    by_league:leagueCoverage
  };

  let state = failures.length ? "INCOMPLETE" : (verification.length ? "PROVISIONAL_VALID" : "CURRENT_VALID");

  const rawStored = svlStoreSource_({
    folders:cfg.folders,
    sport:"SOCCER",
    sourceKey:"espn_incremental",
    fileName:"SOCCER_ESPN_INCREMENTAL_CURRENT.json",
    blob:rawBlob,
    sha256:rawSha,
    retrievedAt:retrievedAt,
    updatedAt:null,
    sourceUrl:rawObj.endpoint_template,
    state:failures.length ? "INCOMPLETE" : "CURRENT_VALID",
    coverage:{requests_expected:specs.length,requests_failed:failures.length}
  });

  const eventsObj = {
    schema:SVL_SOCCER.schemaVersion,
    season_start_ymd:svlSoccerYmd_(seasonStart),
    cutoff_ymd:svlSoccerYmd_(to),
    retrieved_at:retrievedAt,
    leagues:SVL_SOCCER.leagues.map(function(x){return x.code;}),
    events:currentEvents
  };
  const eventsBlob = Utilities.newBlob(JSON.stringify(eventsObj), "application/json", "SOCCER_EVENTS_CURRENT.json");
  const eventsSha = svlSha256Bytes_(eventsBlob.getBytes());
  const eventsStored = svlStoreSource_({
    folders:cfg.folders,
    sport:"SOCCER",
    sourceKey:"normalized_events",
    fileName:"SOCCER_EVENTS_CURRENT.json",
    blob:eventsBlob,
    sha256:eventsSha,
    retrievedAt:retrievedAt,
    updatedAt:null,
    sourceUrl:"derived_from_espn_scoreboard_by_league_date",
    state:state,
    coverage:coverage
  });

  const manifest = {
    schema:"Sports Value Lab Data Ingestion Manifest v1",
    ingestion_version:SVL_INGESTION.VERSION,
    sport:"Soccer",
    retrieved_at:retrievedAt,
    cutoff_ymd:svlSoccerYmd_(to),
    window:{from_ymd:svlSoccerYmd_(from),to_ymd:svlSoccerYmd_(to),overlap_days:SVL_SOCCER.overlapDays},
    status:state,
    source_contract:{
      provider:"ESPN Soccer Scoreboard",
      endpoint_template:rawObj.endpoint_template,
      leagues:SVL_SOCCER.leagues,
      scope_rule:"All CURRENT-league events in date window are ingested; FINAL events are P5-promotable only when 90m result is resolved and any required official verification is cleared.",
      settlement_rule:"regulation_90_* is stored separately from post_regulation_* and penalty_shootout_*."
    },
    sources:{
      espn_incremental:rawStored.manifest,
      normalized_events:eventsStored.manifest,
      official_verification:officialEvidence
    },
    coverage:coverage,
    failures:failures,
    verification_queue:verification,
    controls:{
      odds_requested:false,
      pick_register_modified:false,
      model_modified:false,
      features_modified:false,
      immutable_snapshot_policy:true,
      current_pointer_written:true
    }
  };

  const m = svlStoreJsonManifest_(cfg.folders, "SOCCER_INGESTION", manifest, now);
  return {ok:state !== "INCOMPLETE",sport:"Soccer",status:state,manifest:m,coverage:coverage,verification_queue:verification};
}

function svlSoccerNormalizeEvent_(league, ev, sourceUrl, retrievedAt) {
  if (!ev || !ev.id || !ev.competitions || !ev.competitions.length) return null;
  const c = ev.competitions[0];
  const competitors = c.competitors || [];
  const home = competitors.filter(function(x){return x.homeAway === "home";})[0];
  const away = competitors.filter(function(x){return x.homeAway === "away";})[0];
  if (!home || !away) return null;

  const status = (ev.status && ev.status.type) || {};
  const statusText = [status.name,status.description,status.detail,status.shortDetail].filter(Boolean).join(" ");
  let cls = "SCHEDULED";
  if (status.completed === true || /STATUS_FINAL|final|full time|ft/i.test(statusText)) cls = "FINAL";
  if (/postpon/i.test(statusText)) cls = "POSTPONED";
  if (/cancel|abandon/i.test(statusText)) cls = "CANCELLED";

  function n_(v) {
    if (v === null || v === undefined || v === "") return null;
    const x = Number(v);
    return isFinite(x) ? x : null;
  }
  function periodValues_(comp) {
    return (comp.linescores || []).map(function(x){ return n_(x.value !== undefined ? x.value : x.displayValue); }).filter(function(x){return x !== null;});
  }

  const hl = periodValues_(home), al = periodValues_(away);
  let regH = null, regA = null, postH = null, postA = null;
  if (hl.length >= 2 && al.length >= 2) {
    regH = hl[0] + hl[1];
    regA = al[0] + al[1];
    if (hl.length > 2) postH = hl.slice(2).reduce(function(a,b){return a+b;},0);
    if (al.length > 2) postA = al.slice(2).reduce(function(a,b){return a+b;},0);
  }

  const shootH = n_(home.shootoutScore);
  const shootA = n_(away.shootoutScore);
  const hasPens = shootH !== null || shootA !== null || /penalt/i.test(statusText);
  const hasEt = (hl.length > 2 || al.length > 2 || /extra time|aet/i.test(statusText));

  if (cls === "FINAL" && !hasEt && !hasPens && regH === null && regA === null) {
    regH = n_(home.score);
    regA = n_(away.score);
  }

  return {
    event_id:String(ev.id),
    league:league.code,
    competition:league.name,
    date_utc:ev.date || c.date || null,
    home_team:home.team ? (home.team.displayName || home.team.name || null) : null,
    away_team:away.team ? (away.team.displayName || away.team.name || null) : null,
    home_team_id:home.team ? String(home.team.id || "") : null,
    away_team_id:away.team ? String(away.team.id || "") : null,
    status_class:cls,
    status_detail:statusText || null,
    regulation_90_home:regH,
    regulation_90_away:regA,
    post_regulation_home:postH,
    post_regulation_away:postA,
    penalty_shootout_home:shootH,
    penalty_shootout_away:shootA,
    espn_final_home:n_(home.score),
    espn_final_away:n_(away.score),
    has_extra_time:hasEt,
    has_penalties:hasPens,
    source_name:"ESPN Soccer Scoreboard",
    source_url:sourceUrl,
    retrieved_at:retrievedAt,
    official_verification_url:league.official
  };
}

function svlSoccerVerificationReasons_(old, cur) {
  const out = [];
  if (cur.status_class === "POSTPONED") out.push("postponed");
  if (cur.status_class === "CANCELLED") out.push("cancelled_or_abandoned");
  if (cur.has_extra_time) out.push("extra_time");
  if (cur.has_penalties) out.push("penalties");
  if (cur.status_class === "FINAL" && (cur.regulation_90_home === null || cur.regulation_90_away === null)) out.push("regulation_90_unresolved");
  if (old) {
    const fields = ["date_utc","status_class","regulation_90_home","regulation_90_away","espn_final_home","espn_final_away"];
    if (fields.some(function(k){return String(old[k]) !== String(cur[k]);})) out.push("correction_or_reschedule_detected");
  }
  return out;
}

function svlSoccerFetchOfficialEvidence_(queue, retrievedAt) {
  const byLeague = {};
  queue.forEach(function(q){ byLeague[q.league] = true; });
  const out = {};
  SVL_SOCCER.leagues.filter(function(lg){return byLeague[lg.code];}).forEach(function(lg) {
    try {
      const r = UrlFetchApp.fetch(lg.official,{method:"get",followRedirects:true,muteHttpExceptions:true,headers:{"User-Agent":"SportsValueLab/1.0"}});
      const blob = r.getBlob();
      out[lg.code] = {
        official_url:lg.official,
        http_code:r.getResponseCode(),
        retrieved_at:retrievedAt,
        sha256:svlSha256Bytes_(blob.getBytes()),
        size_bytes:blob.getBytes().length,
        parsed_resolution:false,
        note:"Official page captured as verification evidence. Automatic score promotion is not attempted from heterogeneous HTML; unresolved discrepancies remain in verification_queue."
      };
    } catch (err) {
      out[lg.code] = {official_url:lg.official,retrieved_at:retrievedAt,error:String(err),parsed_resolution:false};
    }
  });
  return out;
}

function svlSoccerReadCurrentManifest_(folders) {
  try {
    const f = svlFindByName_(DriveApp.getFolderById(folders.current), "SOCCER_INGESTION_CURRENT.json");
    return f ? JSON.parse(f.getBlob().getDataAsString("UTF-8")) : null;
  } catch (e) { return null; }
}

function svlSoccerReadCurrentEvents_(folders) {
  try {
    const f = svlFindByName_(DriveApp.getFolderById(folders.current), "SOCCER_EVENTS_CURRENT.json");
    if (!f) return [];
    const j = JSON.parse(f.getBlob().getDataAsString("UTF-8"));
    return Array.isArray(j.events) ? j.events : [];
  } catch (e) { return []; }
}

function svlSoccerSeasonStart_(now) {
  const y = Number(Utilities.formatDate(now, SVL_INGESTION.TZ, "yyyy"));
  const m = Number(Utilities.formatDate(now, SVL_INGESTION.TZ, "M"));
  const startYear = m >= 7 ? y : y - 1;
  return new Date(Date.UTC(startYear,6,1));
}

function svlSoccerTodayUtcDate_(now) {
  return svlSoccerParseYmd_(Utilities.formatDate(now, SVL_INGESTION.TZ, "yyyyMMdd"));
}

function svlSoccerParseYmd_(s) {
  const t = String(s).replace(/-/g,"");
  return new Date(Date.UTC(Number(t.slice(0,4)),Number(t.slice(4,6))-1,Number(t.slice(6,8))));
}

function svlSoccerYmd_(d) {
  return Utilities.formatDate(d, "UTC", "yyyyMMdd");
}

function svlSoccerDateRange_(from,to) {
  const arr = [];
  for (let d=new Date(from.getTime()); d<=to; d=new Date(d.getTime()+86400000)) arr.push(d);
  return arr;
}

function svlSoccerPreflight() {
  const cfg = SVL_INGESTION.SPORTS.SOCCER;
  const cur = DriveApp.getFolderById(cfg.folders.current);
  const mf = svlFindByName_(cur,"SOCCER_INGESTION_CURRENT.json");
  const ef = svlFindByName_(cur,"SOCCER_EVENTS_CURRENT.json");
  const blockers = [];
  if (!mf) blockers.push("SOCCER_INGESTION_CURRENT.json missing");
  if (!ef) blockers.push("SOCCER_EVENTS_CURRENT.json missing");
  let manifest = null;
  if (mf) {
    manifest = JSON.parse(mf.getBlob().getDataAsString("UTF-8"));
    if (manifest.status === "INCOMPLETE") blockers.push("manifest_incomplete");
    if (!manifest.coverage || manifest.coverage.requests_failed > 0) blockers.push("source_request_failures");
  }
  return {ok:blockers.length===0,status:blockers.length?"INCOMPLETE":manifest.status,blockers:blockers,manifest_file_id:mf?mf.getId():null,events_file_id:ef?ef.getId():null};
}
