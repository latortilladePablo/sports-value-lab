/**
 * SPORTS VALUE LAB — Tennis Persistent P5 Ingestion v1.0
 * ATP primary: ATP Tour current scores JSON backend + Results Archive discovery.
 * WTA primary: official api.wtatennis.com tournaments/matches JSON.
 * Cross-check is verification only; never primary ingestion.
 */

const SVL_TENNIS = {
  overlapDays: 8,
  ATP: {
    currentScoresUrl: "https://www.atptour.com/en/-/ajax/Scores/GetInitialScores",
    archiveTemplate: "https://www.atptour.com/en/scores/results-archive?year={year}"
  },
  WTA: {
    tournamentsUrl: "https://api.wtatennis.com/tennis/tournaments/",
    matchesTemplate: "https://api.wtatennis.com/tennis/tournaments/{id}/{year}/matches"
  },
  ATP_FALLBACK: {
    provider: "Live Tennis API",
    base: "https://api.livetennisapi.com/api/public/v1",
    scriptProperty: "SVL_TENNIS_LIVE_API_KEY",
    authHeader: "X-API-Key",
    trackedFile: "TENNIS_ATP_TRACKED_CURRENT.json",
    maxCallsPerRun: 90,
    allowedTiers: ["grand_slam","atp_finals","atp_1000","atp_500","atp_250","next_gen_finals"]
  },
  crosscheck: "Flashscore Tennis Results by tournament/week; verification only"
};

function svlIngestTennis_() {
  const cfg = SVL_INGESTION.SPORTS.TENNIS;
  const now = new Date();
  const retrievedAt = now.toISOString();
  const priorManifest = svlTennisReadJson_(cfg.folders, "TENNIS_INGESTION_CURRENT.json");
  const priorEventsObj = svlTennisReadJson_(cfg.folders, "TENNIS_EVENTS_CURRENT.json");
  const priorEvents = priorEventsObj && Array.isArray(priorEventsObj.events) ? priorEventsObj.events : [];

  let from = new Date(now.getTime() - SVL_TENNIS.overlapDays * 86400000);
  if (priorManifest && priorManifest.cutoff_ymd) {
    const d = svlTennisDate_(priorManifest.cutoff_ymd);
    d.setUTCDate(d.getUTCDate() - SVL_TENNIS.overlapDays);
    if (d < from) from = d;
  }
  const to = new Date(now.getTime());
  const fromIso = Utilities.formatDate(from, "UTC", "yyyy-MM-dd");
  const toIso = Utilities.formatDate(to, "UTC", "yyyy-MM-dd");
  const cutoffYmd = Utilities.formatDate(to, SVL_INGESTION.TZ, "yyyyMMdd");

  const failures = [];
  const raw = { atp:null, wta:{tournaments:null, matches:[]} };
  const pulled = [];

  // ATP Results Archive discovery is audit/discovery metadata.
  let atpArchive = null;
  try {
    const year = Number(Utilities.formatDate(now, SVL_INGESTION.TZ, "yyyy"));
    const archiveUrl = SVL_TENNIS.ATP.archiveTemplate.replace("{year}", String(year));
    const ar = UrlFetchApp.fetch(archiveUrl, {
      method:"get", followRedirects:true, muteHttpExceptions:true,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
        "Referer":"https://www.atptour.com/en/scores/results-archive"
      }
    });
    const acode = ar.getResponseCode();
    atpArchive = {
      url:archiveUrl,
      http_code:acode,
      sha256:svlSha256Bytes_(ar.getBlob().getBytes()),
      size_bytes:ar.getBlob().getBytes().length,
      tournaments: acode >= 200 && acode < 300 ? svlTennisATPArchiveDiscover_(ar.getContentText(), year) : []
    };
  } catch (e) {
    atpArchive = {error:String(e)};
  }

  // ATP structured current scores endpoint. The daily trigger accumulates into CURRENT.
  try {
    const r = UrlFetchApp.fetch(SVL_TENNIS.ATP.currentScoresUrl, {
      method:"get", followRedirects:true, muteHttpExceptions:true,
      headers:{
        "Accept":"application/json, text/javascript, */*; q=0.01",
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
        "X-Requested-With":"XMLHttpRequest",
        "Referer":"https://www.atptour.com/en/scores/current"
      }
    });
    svlRequire2xx_(r, "ATP current scores");
    const txt = r.getContentText();
    const j = JSON.parse(txt);
    raw.atp = j;
    const ts = (((j || {}).liveScores || {}).Tournaments || []);
    ts.forEach(function(t) {
      (t.Matches || []).forEach(function(m) {
        if (String(m.MatchType || "").toLowerCase() !== "singles") return;
        const e = svlTennisNormalizeATP_(t,m,retrievedAt);
        if (e) pulled.push(e);
      });
    });
  } catch (e) {
    const officialError = String(e);
    try {
      const fb = svlTennisFetchATPFallback_(fromIso, toIso, retrievedAt);
      raw.atp = {
        source: "Live Tennis API fallback",
        official_atp_error: officialError,
        fallback: fb.raw
      };
      fb.events.forEach(function(ev){ pulled.push(ev); });
      if (!fb.events.length) {
        failures.push({tour:"ATP",stage:"fallback_empty",error:"Live Tennis API fallback returned zero in-scope ATP rows for window " + fromIso + ".." + toIso, official_error:officialError});
      }
    } catch (fallbackErr) {
      failures.push({
        tour:"ATP",
        stage:"official_and_fallback",
        official_error:officialError,
        fallback_error:String(fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr)
      });
    }
  }

  // WTA official API: discover tournaments in the date window, then pull matches per edition.
  try {
    const turl = SVL_TENNIS.WTA.tournamentsUrl +
      "?page=0&pageSize=100&excludeLevels=ITF&from=" + encodeURIComponent(fromIso) +
      "&to=" + encodeURIComponent(toIso);
    const tr = UrlFetchApp.fetch(turl, {
      method:"get", followRedirects:true, muteHttpExceptions:true,
      headers:{"Accept":"application/json","User-Agent":"SportsValueLab/1.0"}
    });
    svlRequire2xx_(tr, "WTA tournaments");
    const tj = JSON.parse(tr.getContentText());
    raw.wta.tournaments = tj;
    (tj.content || []).forEach(function(t) {
      const g = t.tournamentGroup || {};
      const tid = g.id;
      const year = t.year;
      if (tid === null || tid === undefined || !year) return;
      const murl = SVL_TENNIS.WTA.matchesTemplate
        .replace("{id}", encodeURIComponent(String(tid)))
        .replace("{year}", encodeURIComponent(String(year))) +
        "?from=" + encodeURIComponent(fromIso) + "&to=" + encodeURIComponent(toIso);
      try {
        const mr = UrlFetchApp.fetch(murl, {
          method:"get", followRedirects:true, muteHttpExceptions:true,
          headers:{"Accept":"application/json","User-Agent":"SportsValueLab/1.0"}
        });
        svlRequire2xx_(mr, "WTA matches " + tid);
        const mj = JSON.parse(mr.getContentText());
        raw.wta.matches.push({tournament_id:String(tid),year:year,url:murl,payload:mj});
        (mj.matches || []).forEach(function(m) {
          if (String(m.DrawMatchType || "S").toUpperCase() === "D") return;
          const e = svlTennisNormalizeWTA_(t,m,retrievedAt);
          if (e) pulled.push(e);
        });
      } catch (e2) {
        failures.push({tour:"WTA",stage:"matches",tournament_id:String(tid),year:year,error:String(e2)});
      }
    });
  } catch (e) {
    failures.push({tour:"WTA",stage:"tournaments",error:String(e)});
  }

  const merged = {};
  priorEvents.forEach(function(e){ if (e.event_id) merged[e.event_id] = e; });
  pulled.forEach(function(e){ if (e.event_id) merged[e.event_id] = e; });
  const events = Object.keys(merged).map(function(k){return merged[k];}).sort(function(a,b){
    return String(a.start_utc || "").localeCompare(String(b.start_utc || ""));
  });

  const coverage = svlTennisCoverage_(events, pulled, failures, atpArchive);
  let state = failures.length ? "INCOMPLETE" : "CURRENT_VALID";
  if (!failures.length && coverage.special_status_count > 0) state = "PROVISIONAL_VALID";

  const atpBlob = Utilities.newBlob(JSON.stringify({retrieved_at:retrievedAt,archive:atpArchive,current_scores:raw.atp}), "application/json", "TENNIS_ATP_RAW_CURRENT.json");
  const wtaBlob = Utilities.newBlob(JSON.stringify({retrieved_at:retrievedAt,window:{from:fromIso,to:toIso},data:raw.wta}), "application/json", "TENNIS_WTA_RAW_CURRENT.json");

  const atpStored = svlStoreSource_({
    folders:cfg.folders,sport:"TENNIS",sourceKey:"atp_official",
    fileName:"TENNIS_ATP_RAW_CURRENT.json",blob:atpBlob,sha256:svlSha256Bytes_(atpBlob.getBytes()),
    retrievedAt:retrievedAt,updatedAt:null,sourceUrl:SVL_TENNIS.ATP.currentScoresUrl,
    state:failures.some(function(x){return x.tour==="ATP";})?"INCOMPLETE":"CURRENT_VALID",
    coverage:{archive_tournaments:atpArchive && atpArchive.tournaments ? atpArchive.tournaments.length : 0,
              matches_pulled:pulled.filter(function(x){return x.tour==="ATP";}).length}
  });
  const wtaStored = svlStoreSource_({
    folders:cfg.folders,sport:"TENNIS",sourceKey:"wta_official",
    fileName:"TENNIS_WTA_RAW_CURRENT.json",blob:wtaBlob,sha256:svlSha256Bytes_(wtaBlob.getBytes()),
    retrievedAt:retrievedAt,updatedAt:null,sourceUrl:SVL_TENNIS.WTA.tournamentsUrl,
    state:failures.some(function(x){return x.tour==="WTA";})?"INCOMPLETE":"CURRENT_VALID",
    coverage:{matches_pulled:pulled.filter(function(x){return x.tour==="WTA";}).length}
  });

  const eventsObj = {
    schema:"SVL Tennis normalized P5 v1",
    cutoff_ymd:cutoffYmd,
    retrieved_at:retrievedAt,
    source_window:{from:fromIso,to:toIso},
    identity_contract:{
      tournament_id:"TOUR:year:provider_tournament_id",
      player_id:"TOUR:provider_player_id when available; normalized name retained separately",
      event_id:"TOUR:year:provider_tournament_id:provider_match_id",
      round:"provider text preserved; normalized final/SF/QF when unambiguous"
    },
    events:events
  };
  const eb = Utilities.newBlob(JSON.stringify(eventsObj), "application/json", "TENNIS_EVENTS_CURRENT.json");
  const eventsStored = svlStoreSource_({
    folders:cfg.folders,sport:"TENNIS",sourceKey:"normalized_events",
    fileName:"TENNIS_EVENTS_CURRENT.json",blob:eb,sha256:svlSha256Bytes_(eb.getBytes()),
    retrievedAt:retrievedAt,updatedAt:null,sourceUrl:"derived_from_ATP_and_WTA_official_sources",
    state:state,coverage:coverage
  });

  const manifest = {
    schema:"Sports Value Lab Data Ingestion Manifest v1",
    ingestion_version:SVL_INGESTION.VERSION,
    sport:"Tennis",
    retrieved_at:retrievedAt,
    cutoff_ymd:cutoffYmd,
    status:state,
    sources:{
      atp:atpStored.manifest,
      wta:wtaStored.manifest,
      normalized_events:eventsStored.manifest
    },
    contract:{
      atp_primary:["ATP Tour Results Archive","ATP Tour current scores JSON backend"],
      atp_structured_fallback:"Live Tennis API FREE: prospectively capture ATP main-draw singles match IDs from /fixtures and later resolve those same stable IDs with /matches/{matchId}; used only when ATP Tour is blocked from Apps Script.",
      wta_primary:["WTA official tournament calendar API","WTA official tournament matches API"],
      crosscheck:SVL_TENNIS.crosscheck,
      scope:"ATP Singles + WTA Singles",
      statuses:["FINISHED","RETIRED","WALKOVER","DEFAULT","CANCELLED","POSTPONED","LIVE","SCHEDULED"],
      settlement_note:"Retirement/walkover/cancelled remain explicit; set scores are never converted into completed-match results."
    },
    coverage:coverage,
    failures:failures,
    controls:{odds_requested:false,pick_register_modified:false,model_modified:false,features_modified:false}
  };
  const ms = svlStoreJsonManifest_(cfg.folders,"TENNIS_INGESTION",manifest,now);
  return {ok:state!=="INCOMPLETE",sport:"Tennis",status:state,manifest:ms,coverage:coverage,failures:failures};
}

function svlTennisFetchATPFallback_(fromIso,toIso,retrievedAt) {
  const key = PropertiesService.getScriptProperties().getProperty(SVL_TENNIS.ATP_FALLBACK.scriptProperty);
  if (!key) throw new Error("missing_script_property_" + SVL_TENNIS.ATP_FALLBACK.scriptProperty);

  const cfg = SVL_INGESTION.SPORTS.TENNIS;
  const priorTrackedObj = svlTennisReadJson_(cfg.folders, SVL_TENNIS.ATP_FALLBACK.trackedFile) || {};
  const tracked = priorTrackedObj.matches || {};
  const calls = [];
  const nowMs = new Date(retrievedAt).getTime();

  // FREE plan strategy: discover ATP main-draw singles prospectively, persist stable
  // match IDs, then resolve those exact IDs after they start/finish. This avoids
  // relying on the paid completed-match listing and preserves pre-event identity.
  // Do not server-filter by tier: the provider documents that a newly discovered
  // tournament may temporarily publish tier=null. tour=atp + singles + main draw
  // is the authoritative scope gate; known non-main-tour tiers are rejected locally.
  const discoveryUrl = SVL_TENNIS.ATP_FALLBACK.base +
    "/fixtures?tour=atp&draw=singles&is_qualifying=false&limit=100&offset=0";

  const discovery = svlTennisLiveGet_(discoveryUrl, key, "ATP Live Tennis fixture discovery");
  calls.push({kind:"discovery",url:discoveryUrl,http_code:discovery.code,bytes:discovery.bytes});
  const discovered = Array.isArray(discovery.json.data) ? discovery.json.data : [];

  discovered.forEach(function(row) {
    if (!svlTennisLiveInScope_(row)) return;
    const id = String(row.id || "");
    if (!id) return;
    const old = tracked[id] || {};
    tracked[id] = {
      match_id:id,
      first_seen_at:old.first_seen_at || retrievedAt,
      last_seen_at:retrievedAt,
      scheduled_time:row.scheduled_time || old.scheduled_time || null,
      tournament_id:row.tournament_id || old.tournament_id || null,
      tournament:row.tournament || old.tournament || null,
      tier:row.tier || old.tier || null,
      round:row.round || old.round || null,
      round_code:row.round_code || old.round_code || null,
      surface:row.surface || old.surface || null,
      player1_id:svlTennisLivePlayerId_(row,1) || old.player1_id || null,
      player1_name:svlTennisLivePlayerName_(row,1) || old.player1_name || null,
      player2_id:svlTennisLivePlayerId_(row,2) || old.player2_id || null,
      player2_name:svlTennisLivePlayerName_(row,2) || old.player2_name || null,
      status:row.status || old.status || "upcoming",
      outcome:row.outcome || old.outcome || null,
      result_version:row.result_version || old.result_version || null,
      terminal:old.terminal === true,
      last_checked_at:old.last_checked_at || null,
      normalized_event:old.normalized_event || null
    };
  });

  // Resolve due/non-terminal IDs. Terminal rows get one inexpensive recheck after
  // 24h when they are still recent, allowing result_version corrections to land.
  const due = Object.keys(tracked).map(function(k){return tracked[k];}).filter(function(x){
    const t = x.scheduled_time ? Date.parse(x.scheduled_time) : NaN;
    if (!isFinite(t)) return !x.terminal;
    if (t > nowMs + 6*3600000) return false;
    if (!x.terminal) return true;
    const lc = x.last_checked_at ? Date.parse(x.last_checked_at) : 0;
    return nowMs - lc >= 24*3600000 && nowMs - t <= 3*86400000;
  }).sort(function(a,b){
    return String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || ""));
  });

  const available = SVL_TENNIS.ATP_FALLBACK.maxCallsPerRun - calls.length;
  if (due.length > available) {
    throw new Error("livetennisapi_quota_guard_due=" + due.length + "_available=" + available);
  }

  const events = [];
  discovered.forEach(function(row){
    const ev = svlTennisNormalizeLiveTennis_(row,retrievedAt);
    if (ev) events.push(ev);
  });

  due.forEach(function(x) {
    const url = SVL_TENNIS.ATP_FALLBACK.base + "/matches/" + encodeURIComponent(String(x.match_id));
    const rr = svlTennisLiveGet_(url, key, "ATP Live Tennis match " + x.match_id);
    calls.push({kind:"match",match_id:String(x.match_id),url:url,http_code:rr.code,bytes:rr.bytes});
    const row = rr.json;
    if (!svlTennisLiveInScope_(row)) return;
    const ev = svlTennisNormalizeLiveTennis_(row,retrievedAt);
    if (ev) {
      events.push(ev);
      x.normalized_event = ev;
    }
    x.last_checked_at = retrievedAt;
    x.status = row.status || x.status || null;
    x.outcome = row.outcome || null;
    x.result_version = row.result_version || x.result_version || null;
    x.terminal = ["completed","cancelled"].indexOf(String(row.status || "").toLowerCase()) >= 0 ||
                 ["completed","retired","walkover","default","abandoned","unresolved"].indexOf(String(row.outcome || "").toLowerCase()) >= 0;
    x.last_seen_at = retrievedAt;
  });

  // Carry forward tracked normalized rows so a match that disappeared from the
  // upcoming list remains represented until/after resolution.
  Object.keys(tracked).forEach(function(k){
    const ev = tracked[k].normalized_event;
    if (ev) events.push(ev);
  });

  const dedup = {};
  events.forEach(function(ev){ if (ev && ev.event_id) dedup[ev.event_id] = ev; });
  const finalEvents = Object.keys(dedup).map(function(k){return dedup[k];});

  const trackedObj = {
    schema:"SVL Tennis ATP Live Tennis tracked ids v1",
    provider:"Live Tennis API",
    strategy:"prospective_id_capture_then_single_match_resolution",
    updated_at:retrievedAt,
    matches:tracked
  };
  const tb = Utilities.newBlob(JSON.stringify(trackedObj),"application/json",SVL_TENNIS.ATP_FALLBACK.trackedFile);
  const trackedStored = svlStoreSource_({
    folders:cfg.folders,sport:"TENNIS",sourceKey:"atp_live_tracked",
    fileName:SVL_TENNIS.ATP_FALLBACK.trackedFile,blob:tb,sha256:svlSha256Bytes_(tb.getBytes()),
    retrievedAt:retrievedAt,updatedAt:null,sourceUrl:SVL_TENNIS.ATP_FALLBACK.base + "/matches",
    state:"CURRENT_VALID",
    coverage:{
      tracked_ids:Object.keys(tracked).length,
      discovered_upcoming:discovered.length,
      resolved_this_run:due.length,
      api_calls_this_run:calls.length
    }
  });

  return {
    events:finalEvents,
    raw:{
      provider:"Live Tennis API",
      base:SVL_TENNIS.ATP_FALLBACK.base,
      auth:"X-API-Key via Script Property " + SVL_TENNIS.ATP_FALLBACK.scriptProperty,
      strategy:"prospective_id_capture_then_single_match_resolution",
      discovery_endpoint:"/fixtures?tour=atp&draw=singles&is_qualifying=false",
      detail_endpoint:"/matches/{matchId}",
      free_plan_note:"No completed-list dependency; stable IDs are captured before start and resolved individually.",
      window:{from:fromIso,to:toIso},
      allowed_tiers:SVL_TENNIS.ATP_FALLBACK.allowedTiers,
      discovered_upcoming:discovered.length,
      tracked_ids:Object.keys(tracked).length,
      resolved_this_run:due.length,
      calls:calls,
      tracked_manifest:trackedStored.manifest
    }
  };
}

function svlTennisLiveGet_(url,key,label) {
  const r = UrlFetchApp.fetch(url,{
    method:"get",followRedirects:true,muteHttpExceptions:true,
    headers:{
      "X-API-Key":key,
      "Accept":"application/json",
      "User-Agent":"SportsValueLab/1.0"
    }
  });
  const code = r.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(label + " HTTP " + code + ": " + r.getContentText().slice(0,500));
  }
  const txt = r.getContentText();
  return {code:code,json:JSON.parse(txt),bytes:r.getBlob().getBytes().length};
}

function svlTennisLiveInScope_(row) {
  if (!row) return false;
  if (String(row.tour || "").toLowerCase() !== "atp") return false;
  if (String(row.draw || "").toLowerCase() !== "singles") return false;
  if (row.is_qualifying !== false) return false;
  const tier = row.tier === null || row.tier === undefined ? "" : String(row.tier).toLowerCase();
  // tier=null is allowed prospectively because the provider can publish a new event
  // before its season tier has been resolved. Once present, the tier must be in scope.
  return !tier || SVL_TENNIS.ATP_FALLBACK.allowedTiers.indexOf(tier) >= 0;
}

function svlTennisLivePlayerObj_(row,n) {
  const p = row && row.players ? row.players : {};
  return p["p"+n] || p["player"+n] || p[String(n)] || row["player"+n] || {};
}

function svlTennisLivePlayerId_(row,n) {
  const p=svlTennisLivePlayerObj_(row,n);
  return p.id || row["player"+n+"_id"] || row["p"+n+"_id"] || null;
}

function svlTennisLivePlayerName_(row,n) {
  const p=svlTennisLivePlayerObj_(row,n);
  return p.name || row["player"+n+"_name"] || row["p"+n+"_name"] || null;
}

function svlTennisLiveSetScores_(score) {
  if (!score || !Array.isArray(score.games) || score.games.length < 2) return [];
  const a=score.games[0] || [], b=score.games[1] || [];
  const out=[];
  const n=Math.max(a.length,b.length);
  for (let i=0;i<n;i++) {
    if (a[i]===undefined && b[i]===undefined) continue;
    out.push({set:i+1,a:a[i]===undefined?null:Number(a[i]),b:b[i]===undefined?null:Number(b[i])});
  }
  return out;
}

function svlTennisNormalizeLiveTennis_(row,retrievedAt) {
  if (!svlTennisLiveInScope_(row)) return null;
  const mid=String(row.id || "");
  if (!mid) return null;
  const tid=String(row.tournament_id || row.tournament || "UNKNOWN");
  const p1id=svlTennisLivePlayerId_(row,1);
  const p2id=svlTennisLivePlayerId_(row,2);
  const p1name=svlTennisLivePlayerName_(row,1);
  const p2name=svlTennisLivePlayerName_(row,2);

  const rawStatus=String(row.status || "").toLowerCase();
  const outcome=String(row.outcome || "").toLowerCase();
  let status="SCHEDULED";
  if (rawStatus==="live") status="LIVE";
  if (rawStatus==="completed" || outcome==="completed") status="FINISHED";
  if (outcome==="retired") status="RETIRED";
  else if (outcome==="walkover") status="WALKOVER";
  else if (outcome==="default") status="DEFAULT";
  else if (outcome==="abandoned" || rawStatus==="cancelled") status="CANCELLED";
  else if (outcome==="unresolved") status="POSTPONED";

  let winnerSide=null;
  const winner=Number(row.winner);
  if (winner===1) winnerSide="A";
  else if (winner===2) winnerSide="B";

  return {
    event_id:"ATP:LIVETENNIS:"+mid,
    tour:"ATP",
    tournament_id:"ATP:LIVETENNIS:"+tid,
    tournament_name:row.tournament||null,
    tournament_location:null,
    tournament_rank_id:null,
    tournament_tier:row.tier||null,
    surface:row.surface||null,
    indoor:row.indoor===undefined?null:row.indoor,
    format:row.format||null,
    provider_match_id:mid,
    round_raw:row.round||null,
    round_normalized:row.round_code||svlTennisRound_(row.round),
    player_a_id:p1id?"ATP:LIVETENNIS:"+String(p1id):null,
    player_a_name:p1name||null,
    player_b_id:p2id?"ATP:LIVETENNIS:"+String(p2id):null,
    player_b_name:p2name||null,
    winner_side:winnerSide,
    status:status,
    status_raw:rawStatus||null,
    status_detail:outcome||row.event_status||null,
    outcome:outcome||null,
    withdrew:row.withdrew===undefined?null:row.withdrew,
    result_version:row.result_version||null,
    result_restated_at:row.result_restated_at||null,
    set_scores:svlTennisLiveSetScores_(row.score),
    start_utc:row.scheduled_time||null,
    source_name:"Live Tennis API ATP fallback",
    source_url:SVL_TENNIS.ATP_FALLBACK.base + "/matches/" + mid,
    source_role:"structured_fallback_when_ATP_Tour_blocked",
    retrieved_at:retrievedAt
  };
}

function svlTennisRapidRound_(roundId) {
  const n=Number(roundId);
  if (!isFinite(n)) return null;
  if (n===12) return "F";
  if (n===10) return "SF";
  if (n===9) return "QF";
  if (n===8) return "R16";
  if (n===7) return "R32";
  if (n===6) return "R64";
  if (n===5) return "R128";
  if (n>=0 && n<=3) return "Q";
  return null;
}

function svlTennisParseScoreString_(score) {
  const clean=String(score||"").replace(/\b(ret\.?|retired|w\/o|walkover|default)\b/ig," ").trim();
  if (!clean) return [];
  const tokens=clean.split(/\s+/);
  const sets=[];
  tokens.forEach(function(tok,i){
    const m=tok.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) return;
    sets.push({set:sets.length+1,a:Number(m[1]),b:Number(m[2]),tiebreak_loser:m[3]?Number(m[3]):null});
  });
  return sets;
}

function svlTennisNormalizeATP_(t,m,retrievedAt) {
  const a=m.TeamOne||{}, b=m.TeamTwo||{};
  if (!a.PlayerId || !b.PlayerId || !m.Id) return null;
  const info=String(m.MatchInfo||"");
  const rawStatus=String(m.Status||"");
  let status="SCHEDULED";
  if (rawStatus==="F") status="FINISHED";
  else if (rawStatus==="P") status="LIVE";
  if (/retir|ret\.|ret'd|withdraw/i.test(info)) status="RETIRED";
  if (/walkover|w\/o/i.test(info)) status="WALKOVER";
  if (/cancel/i.test(info)) status="CANCELLED";
  const sets=svlTennisATPSets_(a.Scores||{},b.Scores||{});
  const roundRaw=String(m.RoundTitle||"").split(" - ")[0] || null;
  const year=String(t.EventYear||Utilities.formatDate(new Date(),SVL_INGESTION.TZ,"yyyy"));
  return {
    event_id:"ATP:"+year+":"+String(t.EventId)+":"+String(m.Id),
    tour:"ATP",
    tournament_id:"ATP:"+year+":"+String(t.EventId),
    tournament_name:t.Name||null,
    tournament_location:t.Location||null,
    provider_match_id:String(m.Id),
    round_raw:roundRaw,
    round_normalized:svlTennisRound_(roundRaw),
    player_a_id:"ATP:"+String(a.PlayerId),
    player_a_name:a.PlayerOneName||[a.PlayerFirstName,a.PlayerLastName].filter(Boolean).join(" "),
    player_b_id:"ATP:"+String(b.PlayerId),
    player_b_name:b.PlayerOneName||[b.PlayerFirstName,b.PlayerLastName].filter(Boolean).join(" "),
    winner_side:svlTennisATPWinner_(m,a,b),
    status:status,
    status_raw:rawStatus,
    status_detail:info||null,
    set_scores:sets,
    start_utc:null,
    source_name:"ATP Tour",
    source_url:SVL_TENNIS.ATP.currentScoresUrl,
    retrieved_at:retrievedAt
  };
}

function svlTennisATPSets_(a,b) {
  const out=[];
  ["One","Two","Three","Four","Five"].forEach(function(k,i){
    const av=a["Set"+k], bv=b["Set"+k];
    if ((av===null||av===undefined||av==="") && (bv===null||bv===undefined||bv==="")) return;
    out.push({set:i+1,a:av===null||av===undefined?null:String(av),b:bv===null||bv===undefined?null:String(bv),
      tiebreak_a:a["Set"+k+"Tiebreak"]||null,tiebreak_b:b["Set"+k+"Tiebreak"]||null});
  });
  return out;
}

function svlTennisATPWinner_(m,a,b) {
  if (a.TeamStatus==="won-game") return "A";
  if (b.TeamStatus==="won-game") return "B";
  const info=String(m.MatchInfo||"").toLowerCase();
  if (a.PlayerLastName && info.indexOf(String(a.PlayerLastName).toLowerCase()+" wins")>=0) return "A";
  if (b.PlayerLastName && info.indexOf(String(b.PlayerLastName).toLowerCase()+" wins")>=0) return "B";
  return null;
}

function svlTennisNormalizeWTA_(t,m,retrievedAt) {
  const g=t.tournamentGroup||{};
  const year=String(t.year||m.EventYear||Utilities.formatDate(new Date(),SVL_INGESTION.TZ,"yyyy"));
  const tid=String(g.id||m.EventID||"");
  const mid=String(m.MatchID||m.id||"");
  if (!tid || !mid) return null;
  const state=String(m.MatchState||"");
  const rs=String(m.ResultString||"");
  let status={F:"FINISHED",C:"LIVE",U:"SCHEDULED",W:"WALKOVER",X:"CANCELLED",P:"POSTPONED"}[state]||"SCHEDULED";
  if (/ret'd|retired|ret\./i.test(rs)) status="RETIRED";
  if (/w\/o|walkover/i.test(rs)) status="WALKOVER";
  const aid=m.PlayerIDA||null, bid=m.PlayerIDB||null;
  const an=[m.PlayerNameFirstA,m.PlayerNameLastA].filter(Boolean).join(" ");
  const bn=[m.PlayerNameFirstB,m.PlayerNameLastB].filter(Boolean).join(" ");
  return {
    event_id:"WTA:"+year+":"+tid+":"+mid,
    tour:"WTA",
    tournament_id:"WTA:"+year+":"+tid,
    tournament_name:g.name||t.title||null,
    tournament_location:t.city||t.location||null,
    provider_match_id:mid,
    round_raw:m.RoundID===undefined?null:String(m.RoundID),
    round_normalized:svlTennisRoundWTA_(m.RoundID),
    player_a_id:aid?"WTA:"+String(aid):null,
    player_a_name:an||null,
    player_b_id:bid?"WTA:"+String(bid):null,
    player_b_name:bn||null,
    winner_side:svlTennisWTAWinner_(m),
    status:status,
    status_raw:state,
    status_detail:rs||null,
    set_scores:svlTennisWTASets_(m),
    start_utc:m.MatchTimeStamp||null,
    source_name:"WTA Official",
    source_url:SVL_TENNIS.WTA.matchesTemplate.replace("{id}",tid).replace("{year}",year),
    retrieved_at:retrievedAt
  };
}

function svlTennisWTASets_(m) {
  const out=[];
  for (let i=1;i<=5;i++) {
    const a=m["ScoreSet"+i+"A"], b=m["ScoreSet"+i+"B"];
    if ((a===null||a===undefined||a==="") && (b===null||b===undefined||b==="")) continue;
    out.push({set:i,a:a===null||a===undefined?null:Number(a),b:b===null||b===undefined?null:Number(b),
      tiebreak_loser:m["ScoreTbSet"+i]===undefined?null:m["ScoreTbSet"+i]});
  }
  return out;
}

function svlTennisWTAWinner_(m) {
  const r=String(m.ResultString||"");
  if (r.indexOf(" d ")<0) return null;
  const w=r.split(" d ")[0];
  const a=String(m.PlayerNameLastA||""), b=String(m.PlayerNameLastB||"");
  if (a && w.indexOf(a)>=0 && (!b || w.indexOf(b)<0)) return "A";
  if (b && w.indexOf(b)>=0 && (!a || w.indexOf(a)<0)) return "B";
  return null;
}

function svlTennisRound_(x) {
  const s=String(x||"").toLowerCase();
  if (/final/.test(s) && !/semi|quarter/.test(s)) return "F";
  if (/semi/.test(s)) return "SF";
  if (/quarter/.test(s)) return "QF";
  if (/round of 16/.test(s)) return "R16";
  if (/round of 32/.test(s)) return "R32";
  if (/round of 64/.test(s)) return "R64";
  if (/round of 128/.test(s)) return "R128";
  if (/qualif/.test(s)) return "Q";
  return null;
}

function svlTennisRoundWTA_(x) {
  const s=String(x||"").trim().toUpperCase();
  if (s==="F") return "F";
  if (s==="S") return "SF";
  if (s==="Q") return "QF";
  return null;
}

function svlTennisATPArchiveDiscover_(html,year) {
  const out=[], seen={};
  const re=/\/en\/tournaments\/([^"'?\/]+)\/(\d+)\/overview/gi;
  let m;
  while ((m=re.exec(html))!==null) {
    const id=String(m[2]);
    if (seen[id]) continue;
    seen[id]=true;
    out.push({tournament_id:"ATP:"+year+":"+id,provider_id:id,slug:m[1],url:"https://www.atptour.com/en/tournaments/"+m[1]+"/"+id+"/overview"});
  }
  return out;
}

function svlTennisCoverage_(events,pulled,failures,archive) {
  const atp=events.filter(function(x){return x.tour==="ATP";});
  const wta=events.filter(function(x){return x.tour==="WTA";});
  const specials=events.filter(function(x){return ["RETIRED","WALKOVER","CANCELLED","POSTPONED"].indexOf(x.status)>=0;});
  return {
    events_current:events.length,
    atp_events_current:atp.length,
    wta_events_current:wta.length,
    pulled_this_run:pulled.length,
    atp_pulled_this_run:pulled.filter(function(x){return x.tour==="ATP";}).length,
    wta_pulled_this_run:pulled.filter(function(x){return x.tour==="WTA";}).length,
    final:events.filter(function(x){return x.status==="FINISHED";}).length,
    retired:events.filter(function(x){return x.status==="RETIRED";}).length,
    walkover:events.filter(function(x){return x.status==="WALKOVER";}).length,
    cancelled:events.filter(function(x){return x.status==="CANCELLED";}).length,
    postponed:events.filter(function(x){return x.status==="POSTPONED";}).length,
    special_status_count:specials.length,
    atp_archive_tournaments:archive&&archive.tournaments?archive.tournaments.length:0,
    failures:failures.length
  };
}

function svlTennisReadJson_(folders,name) {
  try {
    const f=svlFindByName_(DriveApp.getFolderById(folders.current),name);
    return f?JSON.parse(f.getBlob().getDataAsString("UTF-8")):null;
  } catch(e) { return null; }
}

function svlTennisDate_(ymd) {
  const s=String(ymd).replace(/-/g,"");
  return new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8))));
}

function svlTennisPreflight() {
  const cfg=SVL_INGESTION.SPORTS.TENNIS;
  const cur=DriveApp.getFolderById(cfg.folders.current);
  const names=["TENNIS_ATP_RAW_CURRENT.json","TENNIS_WTA_RAW_CURRENT.json","TENNIS_EVENTS_CURRENT.json","TENNIS_INGESTION_CURRENT.json"];
  const missing=names.filter(function(n){return !svlFindByName_(cur,n);});
  if (missing.length) return {ok:false,status:"INCOMPLETE",blockers:missing};
  const mf=svlFindByName_(cur,"TENNIS_INGESTION_CURRENT.json");
  const j=JSON.parse(mf.getBlob().getDataAsString("UTF-8"));
  return {ok:j.status!=="INCOMPLETE",status:j.status,blockers:j.failures||[],coverage:j.coverage||null,manifest_file_id:mf.getId()};
}
