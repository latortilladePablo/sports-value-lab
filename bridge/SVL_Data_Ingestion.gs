/**
 * SPORTS VALUE LAB — Persistent Data Ingestion v1.0
 *
 * Runs inside the central Google Apps Script bridge project.
 * Purpose: fetch recurring official/structured sources without manual uploads,
 * store immutable snapshots + CURRENT copies in Drive, and emit manifests.
 *
 * This file never reads/writes the pick register and never requests odds.
 */

const SVL_INGESTION = {
  VERSION: "v1.0",
  TZ: "America/Mexico_City",
  STATUS: {
    CURRENT_VALID: 2,
    PROVISIONAL_VALID: 1,
    INCOMPLETE: 0
  },
  SPORTS: {
    NFL: {
      folders: {
        current: "1S8tIU7YEjr5KaI_Kwhdpuk_b9vzwdoqo",
        snapshots: "1I4jOn-8-x6e0tJs67-7QSUJY-XhANCdH",
        manifests: "1OuUCqVabLOL1UTChsMGEHg7RXXaGdr9_"
      },
      schedule: {
        name: "games.csv",
        url: "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
      },
      pbp: {
        filePattern: "play_by_play_<season>.csv.gz",
        releaseApi: "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/pbp",
        directBase: "https://github.com/nflverse/nflverse-data/releases/download/pbp/"
      }
    },
    NBA: {
      folders: {
        current: "1q9OJjX1kGgHkRzn3AMDNY7eI3rYc7L3r",
        snapshots: "1p_cNfdVWpcRLW_ez97a0TcpRRgDpGsNl",
        manifests: "1gSzolztYB7GjxH12nHIllsuqObSQ7Up8"
      },
      seasonEndYear: 2027
    },
    SOCCER: {
      folders: {
        current: "1_JTma3HjDDRbh7jhQdK335TCfDdkvfY1",
        snapshots: "1bOR-ozBE4Z-y5oehJa5DiMZ4_tU8Cvpx",
        manifests: "1MHy_dGz6dG-DR4VD7iLRljQGnYviZL3t"
      }
    },
    TENNIS: {
      folders: {
        current: "1z3muy962WkKMdDbgiIv4zutyHbay4Y_3",
        snapshots: "17oFOX901s8-7teAHQb0O__uJizkMLsyG",
        manifests: "1WL7zQ4kWUwWFdq_Nxkg9r6dvzPOa2USI"
      }
    },
    NHL: {
      folders: {
        current: "1J9Mtu1YYwb0808U9BntBSaOdfYxyS_HS",
        snapshots: "16rfKOBakcPY0wosyVCmdfK1qNmjsr8Bo",
        manifests: "19fEQRV5L2x-zH1PBKVHjTWlHHy7DPzDp"
      },
      seasonEndYear: 2027
    }
  }
};

function svlDataIngestionDispatch_(body) {
  const sport = String((body && body.sport) || "NFL").toUpperCase();
  if (sport === "ALL") {
    return {
      ok: true,
      version: SVL_INGESTION.VERSION,
      results: ["NFL", "NBA", "NHL", "SOCCER", "TENNIS"].map(function(s) {
        try { return svlIngestSport_(s); }
        catch (err) { return { ok: false, sport: s, error: String(err && err.message ? err.message : err) }; }
      })
    };
  }
  return svlIngestSport_(sport);
}

function svlIngestSport_(sport) {
  if (sport === "NFL") return svlIngestNFL_();
  if (sport === "NBA") return svlIngestNBA_();
  if (sport === "NHL") return svlIngestNHL_();
  if (sport === "SOCCER") return svlIngestSoccer_();
  if (sport === "TENNIS") return svlIngestTennis_();
  return { ok: false, sport: sport, error: "adapter_not_configured" };
}

function svlIngestNFL_() {
  const cfg = SVL_INGESTION.SPORTS.NFL;
  const retrieved = new Date();
  const retrievedIso = retrieved.toISOString();

  const scheduleResp = UrlFetchApp.fetch(cfg.schedule.url, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "SportsValueLab/1.0" }
  });
  svlRequire2xx_(scheduleResp, "NFL schedule");
  const scheduleBlob = scheduleResp.getBlob().setName(cfg.schedule.name);
  const scheduleBytes = scheduleBlob.getBytes();
  const scheduleSha = svlSha256Bytes_(scheduleBytes);
  const scheduleText = scheduleBlob.getDataAsString("UTF-8");
  const scheduleMeta = svlParseNFLCompletedGames_(scheduleText);

  const pbpName = cfg.pbp.filePattern.replace("<season>", String(scheduleMeta.season));
  const pbpUrl = cfg.pbp.directBase + encodeURIComponent(pbpName);

  // GitHub release API metadata is optional because Apps Script egress IPs can
  // hit GitHub's unauthenticated shared-IP rate limit. Direct official release
  // download remains authoritative for the bytes.
  let releaseMeta = null;
  try {
    const releaseResp = UrlFetchApp.fetch(cfg.pbp.releaseApi, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "SportsValueLab/1.0"
      }
    });
    if (releaseResp.getResponseCode() >= 200 && releaseResp.getResponseCode() < 300) {
      const release = JSON.parse(releaseResp.getContentText());
      const asset = (release.assets || []).filter(function(a) { return a.name === pbpName; })[0];
      if (asset) {
        releaseMeta = {
          size: Number(asset.size || 0) || null,
          digest: String(asset.digest || "").replace(/^sha256:/i, "").toLowerCase() || null,
          updated_at: asset.updated_at || null,
          browser_download_url: asset.browser_download_url || pbpUrl
        };
      }
    }
  } catch (metaErr) {
    console.log("NFL PBP release metadata optional fetch failed: " + metaErr);
  }

  const downloadUrl = releaseMeta && releaseMeta.browser_download_url
    ? releaseMeta.browser_download_url
    : pbpUrl;

  const pbpResp = UrlFetchApp.fetch(downloadUrl, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "SportsValueLab/1.0" }
  });
  svlRequire2xx_(pbpResp, "NFL PBP asset");
  const pbpBlob = pbpResp.getBlob().setName(pbpName);
  const pbpBytes = pbpBlob.getBytes();
  const pbpSha = svlSha256Bytes_(pbpBytes);

  if (releaseMeta && releaseMeta.digest && pbpSha !== releaseMeta.digest) {
    throw new Error("PBP SHA256 mismatch: got " + pbpSha + " expected " + releaseMeta.digest);
  }
  if (releaseMeta && releaseMeta.size && pbpBytes.length !== releaseMeta.size) {
    throw new Error("PBP size mismatch: got " + pbpBytes.length + " expected " + releaseMeta.size);
  }

  const pbpText = Utilities.ungzip(pbpBlob).getDataAsString("UTF-8");
  const missingIds = scheduleMeta.completedGameIds.filter(function(id) {
    return pbpText.indexOf(id) === -1;
  });
  const coverage = {
    season: scheduleMeta.season,
    completed_games_expected: scheduleMeta.completedGameIds.length,
    completed_games_present: scheduleMeta.completedGameIds.length - missingIds.length,
    missing_game_ids: missingIds,
    latest_completed_week: scheduleMeta.latestCompletedWeek
  };

  const pbpUpdatedAt =
    (releaseMeta && releaseMeta.updated_at) ||
    svlHeader_(pbpResp, "Last-Modified") ||
    null;
  const ageHours = pbpUpdatedAt
    ? (retrieved.getTime() - new Date(pbpUpdatedAt).getTime()) / 3600000
    : null;
  const pbpState = missingIds.length
    ? "INCOMPLETE"
    : (ageHours !== null && ageHours < 36 ? "PROVISIONAL_VALID" : "CURRENT_VALID");

  const scheduleStored = svlStoreSource_({
    folders: cfg.folders,
    sport: "NFL",
    sourceKey: "schedule",
    fileName: cfg.schedule.name,
    blob: scheduleBlob,
    sha256: scheduleSha,
    retrievedAt: retrievedIso,
    updatedAt: svlHeader_(scheduleResp, "Last-Modified"),
    sourceUrl: cfg.schedule.url,
    state: "CURRENT_VALID",
    coverage: {
      season: scheduleMeta.season,
      completed_games: scheduleMeta.completedGameIds.length,
      latest_completed_week: scheduleMeta.latestCompletedWeek
    }
  });

  const pbpStored = svlStoreSource_({
    folders: cfg.folders,
    sport: "NFL",
    sourceKey: "pbp",
    fileName: pbpName,
    blob: pbpBlob,
    sha256: pbpSha,
    retrievedAt: retrievedIso,
    updatedAt: pbpUpdatedAt,
    sourceUrl: downloadUrl,
    state: pbpState,
    coverage: coverage
  });

  const overall = missingIds.length ? "INCOMPLETE" : pbpState;
  const manifest = {
    schema: "Sports Value Lab Data Ingestion Manifest v1",
    ingestion_version: SVL_INGESTION.VERSION,
    sport: "NFL",
    retrieved_at: retrievedIso,
    status: overall,
    sources: {
      schedule: scheduleStored.manifest,
      pbp: pbpStored.manifest
    },
    coverage: coverage,
    controls: {
      odds_requested: false,
      pick_register_modified: false,
      model_modified: false,
      immutable_snapshot_policy: true,
      current_pointer_written: true
    }
  };
  const manifestStored = svlStoreJsonManifest_(cfg.folders, "NFL_INGESTION", manifest, retrieved);
  return {
    ok: overall !== "INCOMPLETE",
    sport: "NFL",
    status: overall,
    manifest: manifestStored,
    coverage: coverage,
    sources: {
      schedule_sha256: scheduleSha,
      pbp_sha256: pbpSha
    }
  };
}

function svlParseNFLCompletedGames_(csvText) {
  const rows = Utilities.parseCsv(csvText);
  if (!rows || rows.length < 2) throw new Error("NFL schedules CSV empty");
  const h = {};
  rows[0].forEach(function(v, i) { h[String(v)] = i; });
  ["game_id","season","game_type","week","home_score","away_score"].forEach(function(k) {
    if (h[k] === undefined) throw new Error("NFL schedules missing column: " + k);
  });

  let season = 0;
  rows.slice(1).forEach(function(r) {
    const s = Number(r[h.season]);
    if (isFinite(s) && s > season) season = s;
  });

  const ids = [];
  let latestWeek = 0;
  rows.slice(1).forEach(function(r) {
    if (Number(r[h.season]) !== season || String(r[h.game_type]) !== "REG") return;
    const hs = String(r[h.home_score] || "").trim();
    const as = String(r[h.away_score] || "").trim();
    if (hs === "" || as === "") return;
    const id = String(r[h.game_id] || "").trim();
    if (!id) return;
    ids.push(id);
    const w = Number(r[h.week]);
    if (isFinite(w) && w > latestWeek) latestWeek = w;
  });

  if (!ids.length) throw new Error("No completed NFL REG games found in current season schedules");
  return {
    season: season,
    latestCompletedWeek: latestWeek,
    completedGameIds: ids
  };
}

function svlStoreSource_(args) {
  const ext = svlExtension_(args.fileName);
  const base = args.fileName.slice(0, args.fileName.length - ext.length);
  // Immutable source snapshots are content-addressed: repeated daily refreshes
  // do not duplicate identical bytes.
  const snapshotName = base + "__sha256_" + args.sha256 + ext;

  const snapshotFolder = DriveApp.getFolderById(args.folders.snapshots);
  let snapshotFile = svlFindByName_(snapshotFolder, snapshotName);
  if (!snapshotFile) snapshotFile = snapshotFolder.createFile(args.blob.copyBlob().setName(snapshotName));

  const currentFolder = DriveApp.getFolderById(args.folders.current);
  svlTrashByName_(currentFolder, args.fileName);
  const currentFile = currentFolder.createFile(args.blob.copyBlob().setName(args.fileName));

  const manifest = {
    source_key: args.sourceKey,
    file_name: args.fileName,
    source_url: args.sourceUrl,
    retrieved_at: args.retrievedAt,
    updated_at: args.updatedAt || null,
    sha256: args.sha256,
    size_bytes: args.blob.getBytes().length,
    status: args.state,
    coverage: args.coverage || null,
    snapshot_file_id: snapshotFile.getId(),
    current_file_id: currentFile.getId()
  };
  return { manifest: manifest };
}

function svlStoreJsonManifest_(folders, prefix, manifest, now) {
  const finalText = JSON.stringify(manifest, null, 2);
  const finalBlob = Utilities.newBlob(finalText, "application/json", prefix + "_CURRENT.json");
  const sha = svlSha256Bytes_(finalBlob.getBytes());

  const manifestsFolder = DriveApp.getFolderById(folders.manifests);
  const stamp = svlStamp_(now);
  const snapshotName = prefix + "__" + stamp + "__sha256_" + sha.slice(0, 16) + ".json";
  let snap = svlFindByName_(manifestsFolder, snapshotName);
  if (!snap) snap = manifestsFolder.createFile(finalBlob.copyBlob().setName(snapshotName));

  const currentFolder = DriveApp.getFolderById(folders.current);
  const currentName = prefix + "_CURRENT.json";
  svlTrashByName_(currentFolder, currentName);
  const cur = currentFolder.createFile(finalBlob.copyBlob().setName(currentName));

  return {
    snapshot_file_id: snap.getId(),
    current_file_id: cur.getId(),
    sha256: sha
  };
}

function svlSha256Bytes_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ("0" + v.toString(16)).slice(-2);
  }).join("");
}

function svlRequire2xx_(response, label) {
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(label + " HTTP " + code + ": " + response.getContentText().slice(0, 300));
  }
}

function svlHeader_(response, key) {
  const headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
  const target = String(key).toLowerCase();
  const names = Object.keys(headers || {});
  for (let i = 0; i < names.length; i++) {
    if (String(names[i]).toLowerCase() === target) return String(headers[names[i]]);
  }
  return null;
}

function svlExtension_(name) {
  if (/\.csv\.gz$/i.test(name)) return ".csv.gz";
  const m = String(name).match(/(\.[^.]+)$/);
  return m ? m[1] : "";
}

function svlStamp_(date) {
  return Utilities.formatDate(date, SVL_INGESTION.TZ, "yyyyMMdd_HHmmss");
}

function svlFindByName_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function svlTrashByName_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) files.next().setTrashed(true);
}

function svlScheduledIngestion_() {
  const result = svlDataIngestionDispatch_({ sport: "ALL" });
  console.log(JSON.stringify(result));
  return result;
}

/**
 * PUBLIC — visible in the Apps Script function selector.
 * Run this once to smoke-test ingestion immediately.
 */
function svlRunIngestionNow() {
  return svlScheduledIngestion_();
}

/**
 * PUBLIC — visible in the Apps Script function selector.
 * Run this once to install/replace the daily ingestion trigger.
 */
function svlActivateDataIngestion() {
  const smoke = svlScheduledIngestion_();
  if (!smoke || smoke.ok !== true) throw new Error("Ingestion smoke test failed: " + JSON.stringify(smoke));
  return svlInstallDailyIngestionTrigger();
}

function svlInstallDailyIngestionTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    const handler = t.getHandlerFunction();
    if (handler === "svlRunIngestionNow" || handler === "svlScheduledIngestion_") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("svlRunIngestionNow")
    .timeBased()
    .everyDays(1)
    .atHour(11)
    .create();
  return { ok: true, handler: "svlRunIngestionNow", cadence: "daily", hour_script_tz: 11 };
}


/**
 * PUBLIC diagnostic — visible in Apps Script selector.
 * Does not write files. Logs each NFL ingestion stage separately.
 */
function svlDiagnoseNFLIngestion() {
  const cfg = SVL_INGESTION.SPORTS.NFL;
  const report = { ok: false, stages: [] };

  function stage_(name, fn) {
    try {
      const value = fn();
      const item = { stage: name, ok: true, value: value };
      report.stages.push(item);
      console.log(JSON.stringify(item));
      return value;
    } catch (err) {
      const item = {
        stage: name,
        ok: false,
        error: String(err && err.stack ? err.stack : (err && err.message ? err.message : err))
      };
      report.stages.push(item);
      console.error(JSON.stringify(item));
      throw err;
    }
  }

  stage_("drive_current_folder", function() {
    const f = DriveApp.getFolderById(cfg.folders.current);
    return { id: f.getId(), name: f.getName() };
  });
  stage_("drive_snapshots_folder", function() {
    const f = DriveApp.getFolderById(cfg.folders.snapshots);
    return { id: f.getId(), name: f.getName() };
  });
  stage_("drive_manifests_folder", function() {
    const f = DriveApp.getFolderById(cfg.folders.manifests);
    return { id: f.getId(), name: f.getName() };
  });

  const scheduleResp = stage_("schedule_fetch", function() {
    const r = UrlFetchApp.fetch(cfg.schedule.url, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { "User-Agent": "SportsValueLab/1.0" }
    });
    return {
      code: r.getResponseCode(),
      bytes: r.getBlob().getBytes().length,
      text: r.getContentText().slice(0, 120)
    };
  });
  if (scheduleResp.code < 200 || scheduleResp.code >= 300) {
    throw new Error("schedule_fetch_http_" + scheduleResp.code);
  }

  const scheduleRaw = UrlFetchApp.fetch(cfg.schedule.url, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "SportsValueLab/1.0" }
  });
  const scheduleText = scheduleRaw.getContentText();
  const scheduleMeta = stage_("schedule_parse", function() {
    const m = svlParseNFLCompletedGames_(scheduleText);
    return {
      season: m.season,
      latestCompletedWeek: m.latestCompletedWeek,
      completedGameCount: m.completedGameIds.length,
      firstGameId: m.completedGameIds[0],
      lastGameId: m.completedGameIds[m.completedGameIds.length - 1]
    };
  });

  const pbpName = cfg.pbp.filePattern.replace("<season>", String(scheduleMeta.season));
  const directUrl = cfg.pbp.directBase + encodeURIComponent(pbpName);

  const releaseData = stage_("github_release_metadata_optional", function() {
    const r = UrlFetchApp.fetch(cfg.pbp.releaseApi, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "SportsValueLab/1.0"
      }
    });
    const code = r.getResponseCode();
    if (code < 200 || code >= 300) {
      return {
        code: code,
        optional: true,
        fallback: "direct_release_download",
        browser_download_url: directUrl
      };
    }
    const release = JSON.parse(r.getContentText());
    const asset = (release.assets || []).filter(function(a) {
      return a.name === pbpName;
    })[0];
    if (!asset) {
      return {
        code: code,
        optional: true,
        assetFound: false,
        fallback: "direct_release_download",
        browser_download_url: directUrl
      };
    }
    return {
      code: code,
      optional: true,
      assetFound: true,
      id: asset.id,
      name: asset.name,
      size: asset.size,
      digest: asset.digest || null,
      updated_at: asset.updated_at || null,
      browser_download_url: asset.browser_download_url || directUrl
    };
  });

  const pbpDownloadUrl = releaseData.browser_download_url || directUrl;

  const pbpData = stage_("pbp_binary_fetch", function() {
    const r = UrlFetchApp.fetch(pbpDownloadUrl, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { "User-Agent": "SportsValueLab/1.0" }
    });
    const blob = r.getBlob().setName(pbpName);
    const bytes = blob.getBytes();
    return {
      code: r.getResponseCode(),
      contentType: blob.getContentType(),
      bytes: bytes.length,
      sha256: svlSha256Bytes_(bytes),
      lastModified: svlHeader_(r, "Last-Modified")
    };
  });
  if (pbpData.code < 200 || pbpData.code >= 300) {
    throw new Error("pbp_fetch_http_" + pbpData.code);
  }

  stage_("pbp_integrity", function() {
    const expectedDigest = String(releaseData.digest || "").replace(/^sha256:/i, "").toLowerCase();
    return {
      providerMetadataAvailable: !!(releaseData.assetFound),
      sizeMatches: !releaseData.size || Number(releaseData.size) === Number(pbpData.bytes),
      shaMatches: !expectedDigest || expectedDigest === pbpData.sha256,
      expectedSize: releaseData.size || null,
      actualSize: pbpData.bytes,
      expectedSha: expectedDigest || null,
      actualSha: pbpData.sha256
    };
  });

  const pbpResp = UrlFetchApp.fetch(pbpDownloadUrl, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "SportsValueLab/1.0" }
  });
  const pbpBlob = pbpResp.getBlob().setName(pbpName);
  const pbpText = stage_("pbp_gunzip", function() {
    const text = Utilities.ungzip(pbpBlob).getDataAsString("UTF-8");
    return { chars: text.length, head: text.slice(0, 120) };
  });

  const fullPbpText = Utilities.ungzip(pbpBlob).getDataAsString("UTF-8");
  stage_("completed_game_coverage", function() {
    const m = svlParseNFLCompletedGames_(scheduleText);
    const missing = m.completedGameIds.filter(function(id) {
      return fullPbpText.indexOf(id) === -1;
    });
    return {
      season: m.season,
      expected: m.completedGameIds.length,
      present: m.completedGameIds.length - missing.length,
      missing_count: missing.length,
      missing_game_ids: missing.slice(0, 50)
    };
  });

  report.ok = report.stages.every(function(x) { return x.ok; });
  console.log("SVL_DIAG_FINAL " + JSON.stringify(report));
  return report;
}
