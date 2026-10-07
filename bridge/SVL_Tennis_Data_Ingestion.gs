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
    provider: "SportsAPI365 Direct",
    base: "https://api.sportsapi365.com/v1/tennis",
    scriptProperty: "SVL_TENNIS_API_KEY",
    authHeader: "X-Gravitee-Api-Key",
    allowedRankIds: [2,3,4,7]
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
        source: "RapidAPI Tennis API fallback",
        official_atp_error: officialError,
        fallback: fb.raw
      };
      fb.events.forEach(function(ev){ pulled.push(ev); });
      if (!fb.events.length) {
        failures.push({tour:"ATP",stage:"fallback_empty",error:"RapidAPI fallback returned zero in-scope ATP completed results for window " + fromIso + ".." + toIso, official_error:officialError});
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
      atp_structured_fallback:"SportsAPI365 Direct Tennis API results-by-date-range, ATP main tour/Masters/Grand Slam/Tour Finals only; used only when ATP Tour is blocked from Apps Script",
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

  const allowed = {};
  SVL_TENNIS.ATP_FALLBACK.allowedRankIds.forEach(function(x){ allowed[String(x)] = true; });

  // SportsAPI365 Direct exposes completed/historical results by date range.
  // This is the correct P5 fallback family; fixtures may legitimately be empty
  // for already-completed matches and must not gate historical result ingestion.
  const rawPages = [];
  const all = [];
  let pageNo = 1;
  let more = true;

  while (more && pageNo <= 5) {
    const url = SVL_TENNIS.ATP_FALLBACK.base +
      "/atp/results/" + encodeURIComponent(fromIso) + "/" + encodeURIComponent(toIso) +
      "?include=" + encodeURIComponent("tournament") +
      "&filter=" + encodeURIComponent("PlayerGroup:singles;TourRank:2,3,4,7") +
      "&pageSize=500&pageNo=" + pageNo;

    const r = UrlFetchApp.fetch(url, {
      method:"get", followRedirects:true, muteHttpExceptions:true,
      headers:{
        "X-Gravitee-Api-Key":key,
        "Accept":"application/json",
        "User-Agent":"SportsValueLab/1.0"
      }
    });
    svlRequire2xx_(r, "ATP SportsAPI365 results range");
    const j = JSON.parse(r.getContentText());

    let rows = [];
    if (Array.isArray(j.data)) rows = j.data;
    else if (j.data && Array.isArray(j.data.singles)) rows = j.data.singles;
    else if (Array.isArray(j.results)) rows = j.results;

    rawPages.push({
      pageNo:pageNo,
      sha256:svlSha256Bytes_(r.getBlob().getBytes()),
      size_bytes:r.getBlob().getBytes().length,
      item_count:rows.length
    });
    rows.forEach(function(row){ all.push(row); });

    more = j.hasNextPage === true;
    pageNo += 1;
  }
  if (more) throw new Error("sportsapi365_results_pagination_exceeded");

  const scoped = all.filter(function(row) {
    const t = row.tournament || {};
    const rankId = t.rankId !== undefined && t.rankId !== null ? t.rankId : (t.rank && t.rank.id);
    return allowed[String(rankId)] === true;
  });

  const events = scoped.map(function(row){
    return svlTennisNormalizeATPFallback_(row,retrievedAt);
  }).filter(Boolean);

  return {
    events:events,
    raw:{
      provider:"SportsAPI365 Direct Tennis API",
      endpoint:"/atp/results/{startDate}/{endDate}",
      window:{from:fromIso,to:toIso},
      filter:"PlayerGroup:singles;TourRank:2,3,4,7",
      in_scope_rank_ids:SVL_TENNIS.ATP_FALLBACK.allowedRankIds,
      pages:rawPages,
      raw_rows:all.length,
      scoped_rows:scoped.length,
      matches_in_window:events.length
    }
  };
}

function svlTennisNormalizeATPFallback_(row,retrievedAt) {
  const p1=row.player1||{}, p2=row.player2||{}, t=row.tournament||{};
  const mid=String(row.matchId || row.id || "");
  const tid=String(row.tournamentId || t.id || "");
  if (!mid || !tid || !p1.id || !p2.id) return null;

  const rt=String(row.result_type || "completed").toLowerCase();
  let status="FINISHED";
  if (rt==="retired") status="RETIRED";
  else if (rt==="walkover") status="WALKOVER";
  else if (rt==="default") status="DEFAULT";

  return {
    event_id:"ATP:SPORTSAPI365:"+tid+":"+mid,
    tour:"ATP",
    tournament_id:"ATP:SPORTSAPI365:"+tid,
    tournament_name:t.name||null,
    tournament_location:t.countryAcr||null,
    tournament_rank_id:t.rankId!==undefined?t.rankId:(t.rank?t.rank.id:null),
    provider_match_id:mid,
    round_raw:row.roundId===undefined||row.roundId===null?null:String(row.roundId),
    round_normalized:svlTennisRapidRound_(row.roundId),
    player_a_id:"ATP:SPORTSAPI365:"+String(p1.id),
    player_a_name:p1.name||null,
    player_b_id:"ATP:SPORTSAPI365:"+String(p2.id),
    player_b_name:p2.name||null,
    winner_side:String(row.match_winner)===String(p1.id)?"A":(String(row.match_winner)===String(p2.id)?"B":null),
    status:status,
    status_raw:rt,
    status_detail:row.result||null,
    set_scores:svlTennisParseScoreString_(row.result||""),
    start_utc:row.date||null,
    source_name:"SportsAPI365 Direct ATP fallback",
    source_url:SVL_TENNIS.ATP_FALLBACK.base + "/atp/tournament/results/{seasonId}",
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
