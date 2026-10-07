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
        name: "play_by_play_2026.csv.gz",
        releaseApi: "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/pbp"
      }
    }
  }
};

function svlDataIngestionDispatch_(body) {
  const sport = String((body && body.sport) || "NFL").toUpperCase();
  if (sport === "ALL") {
    return {
      ok: true,
      version: SVL_INGESTION.VERSION,
      results: ["NFL"].map(function(s) {
        try { return svlIngestSport_(s); }
        catch (err) { return { ok: false, sport: s, error: String(err && err.message ? err.message : err) }; }
      })
    };
  }
  return svlIngestSport_(sport);
}

function svlIngestSport_(sport) {
  if (sport !== "NFL") {
    return { ok: false, sport: sport, error: "adapter_not_configured" };
  }
  return svlIngestNFL_();
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

  const releaseResp = UrlFetchApp.fetch(cfg.pbp.releaseApi, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "SportsValueLab/1.0"
    }
  });
  svlRequire2xx_(releaseResp, "NFL PBP release metadata");
  const release = JSON.parse(releaseResp.getContentText());
  const asset = (release.assets || []).filter(function(a) { return a.name === cfg.pbp.name; })[0];
  if (!asset) throw new Error("PBP release asset not found: " + cfg.pbp.name);

  const pbpResp = UrlFetchApp.fetch(asset.browser_download_url, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "SportsValueLab/1.0" }
  });
  svlRequire2xx_(pbpResp, "NFL PBP asset");
  const pbpBlob = pbpResp.getBlob().setName(cfg.pbp.name);
  const pbpBytes = pbpBlob.getBytes();
  const pbpSha = svlSha256Bytes_(pbpBytes);
  const expectedDigest = String(asset.digest || "").replace(/^sha256:/i, "").toLowerCase();

  if (expectedDigest && pbpSha !== expectedDigest) {
    throw new Error("PBP SHA256 mismatch: got " + pbpSha + " expected " + expectedDigest);
  }
  if (Number(asset.size || 0) && pbpBytes.length !== Number(asset.size)) {
    throw new Error("PBP size mismatch: got " + pbpBytes.length + " expected " + asset.size);
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

  const ageHours = asset.updated_at
    ? (retrieved.getTime() - new Date(asset.updated_at).getTime()) / 3600000
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
    fileName: cfg.pbp.name,
    blob: pbpBlob,
    sha256: pbpSha,
    retrievedAt: retrievedIso,
    updatedAt: asset.updated_at || release.updated_at || null,
    sourceUrl: asset.browser_download_url,
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

function svlInstallDailyIngestionTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "svlScheduledIngestion_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("svlScheduledIngestion_")
    .timeBased()
    .everyDays(1)
    .atHour(11)
    .create();
  return { ok: true, handler: "svlScheduledIngestion_", cadence: "daily", hour_script_tz: 11 };
}
