/**
 * SPORTS VALUE LAB — Google Sheets Bridge v1
 *
 * Instalar como Apps Script vinculado a Sports_Value_Lab_Registro_CURRENT.
 * No publica ni modifica ningún Sheet. Sólo devuelve un JSON de lectura.
 */

const SVL = {
  BRIDGE_VERSION: "v1.1-snapshot-export",
  TZ: "America/Mexico_City",
  REGISTER: "10IF8B_kZJ2CECt4mJWR-7C-nNljQ3y4N2l4wiLtep6U",
  SPORTS: {
    NBA: {
      id: "1vMBJfkLV-gBYMTU1zlU34bpAFNeCXACJSgdAAvO0nY4",
      control: "NBA_CONTROL",
      continuity: "NBA_CONTINUITY",
      apiLog: "API_LOG",
    },
    Soccer: {
      id: "14ezbmCV0XoWJaqKyisyjiVplQ8rQl7dTSwUlsT01qes",
      control: "SOCCER_CONTROL",
      continuity: "SOCCER_CONTINUITY",
      apiLog: "API_LOG",
    },
    NFL: {
      id: "1IiU142QRV9ilI1tnqujgsP19AzVEFQk-RDGzld7w7Vk",
      control: "NFL_CONTROL",
      continuity: "NFL_CONTINUITY",
      apiLog: "API_LOG",
    },
    NHL: {
      id: "1PQ1ajIWkX0fkxP106vAH5bfTdbSMrI1d_r-DZC2qgYE",
      control: "NHL_CONTROL",
      continuity: "NHL_CONTINUITY",
      apiLog: "API_LOG",
    },
    Tennis: {
      id: "1klBXfvQKr2ucBjJWpqyuDXBVzxd1uPeBfUCZrp4_YJM",
      control: "TENNIS_CONTROL",
      continuity: "TENNIS_CONTINUITY",
      apiLog: "API_LOG",
    },
  },
};

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty("SVL_BRIDGE_TOKEN");
  const supplied = e && e.parameter ? e.parameter.token : "";

  if (!expected || supplied !== expected) {
    return json_({ ok: false, error: "unauthorized" });
  }

  try {
    const payload = {
      ok: true,
      generatedAt: Utilities.formatDate(new Date(), SVL.TZ, "yyyy-MM-dd HH:mm:ss 'CDMX'"),
      bridgeVersion: SVL.BRIDGE_VERSION,
      portfolio: readPortfolio_(),
      picks: readPicks_(),
      runners: readRunnerStatus_(),
      sports: {},
    };

    Object.keys(SVL.SPORTS).forEach((name) => {
      const cfg = SVL.SPORTS[name];
      payload.sports[name] = readSport_(cfg);
    });

    return json_(payload);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("SVL_BRIDGE_TOKEN");
  const supplied = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";

  if (!expected || supplied !== expected) {
    return json_({ ok: false, error: "unauthorized" });
  }

  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    if (body.command === "scan") {
      return json_(dispatchScan_(body));
    }
    if (body.command === "snapshot") {
      return json_(readSnapshotForAnalysis_(body));
    }

    return json_({ ok: false, error: "unsupported_command" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


function readSnapshotForAnalysis_(body) {
  const sport = String(body.sport || "");
  const runId = String(body.runId || "");
  const cfg = SVL.SPORTS[sport];

  if (!cfg) return { ok: false, error: "invalid_sport" };

  const ss = SpreadsheetApp.openById(cfg.id);
  const continuity = ss.getSheetByName(cfg.continuity);
  if (!continuity || continuity.getLastRow() < 2) {
    return { ok: false, error: "continuity_not_found", sport: sport };
  }

  const width = Math.min(Math.max(continuity.getLastColumn(), 1), 25);
  const rows = continuity.getRange(1, 1, continuity.getLastRow(), width).getDisplayValues();
  const headers = rows[0];
  const index = {};
  headers.forEach(function(h, i) { if (h) index[h] = i; });

  let selected = null;
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const id = String(row[index["Run ID"]] || "");
    const analysis = String(row[index["Estado análisis"]] || "");
    if (runId && id === runId) {
      selected = row;
      break;
    }
    if (!runId && /PENDING|DATA_READY|SNAPSHOT_READY/i.test(analysis)) {
      selected = row;
      break;
    }
  }

  if (!selected) return { ok: false, error: "analysis_run_not_found", sport: sport, runId: runId };

  const selectedRunId = String(selected[index["Run ID"]] || "");
  const mode = String(selected[index["Modo"]] || "");
  const snapshotName = String(selected[index["Snapshot/Salida"]] || "");
  const analysisStatus = String(selected[index["Estado análisis"]] || "");

  if (!snapshotName) {
    return { ok: false, error: "snapshot_name_missing", sport: sport, runId: selectedRunId };
  }

  const snapshotSheet = ss.getSheetByName(snapshotName);
  if (!snapshotSheet) {
    return { ok: false, error: "snapshot_sheet_missing", sport: sport, runId: selectedRunId, snapshot: snapshotName };
  }

  const maxRows = 3000;
  const maxCols = 20;
  const lastRow = snapshotSheet.getLastRow();
  const lastCol = snapshotSheet.getLastColumn();

  if (lastRow > maxRows || lastCol > maxCols) {
    return {
      ok: false,
      error: "snapshot_too_large",
      sport: sport,
      runId: selectedRunId,
      snapshot: snapshotName,
      rows: lastRow,
      cols: lastCol,
      limits: { rows: maxRows, cols: maxCols }
    };
  }

  const data = snapshotSheet
    .getRange(1, 1, Math.max(lastRow, 1), Math.max(lastCol, 1))
    .getDisplayValues();

  return {
    ok: true,
    sport: sport,
    runId: selectedRunId,
    mode: mode,
    snapshot: snapshotName,
    analysisStatus: analysisStatus,
    generatedAt: Utilities.formatDate(new Date(), SVL.TZ, "yyyy-MM-dd HH:mm:ss 'CDMX'"),
    bridgeVersion: SVL.BRIDGE_VERSION,
    rows: data
  };
}

function readRunnerStatus_() {
  const props = PropertiesService.getScriptProperties();
  const out = {};
  Object.keys(SVL.SPORTS).forEach((sport) => {
    out[sport] = {
      configured: !!props.getProperty("SVL_RUNNER_" + sport.toUpperCase() + "_URL")
    };
  });
  return out;
}

function dispatchScan_(body) {
  const props = PropertiesService.getScriptProperties();
  const sport = String(body.sport || "");
  const mode = String(body.mode || "");
  const validModes = ["P1_COMPLETO", "P2_CHECK", "P2_AUTO", "P2_FORCE"];

  if (!SVL.SPORTS[sport]) {
    return { ok: false, error: "invalid_sport" };
  }
  if (validModes.indexOf(mode) === -1) {
    return { ok: false, error: "invalid_mode" };
  }

  const url = props.getProperty("SVL_RUNNER_" + sport.toUpperCase() + "_URL");
  const runnerToken = props.getProperty("SVL_RUNNER_TOKEN");
  if (!url || !runnerToken) {
    return { ok: false, error: "runner_not_configured", sport: sport };
  }

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      token: runnerToken,
      sport: sport,
      action: mode,
      requestedAt: Utilities.formatDate(new Date(), SVL.TZ, "yyyy-MM-dd HH:mm:ss")
    })
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    payload = { ok: false, error: "runner_non_json", detail: text.slice(0, 500) };
  }

  return {
    ok: code >= 200 && code < 300 && payload && payload.ok === true,
    httpStatus: code,
    sport: sport,
    mode: mode,
    runner: payload
  };
}

function autorizarActionCenter() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("SVL_RUNNER_NBA_URL");
  const token = props.getProperty("SVL_RUNNER_TOKEN");

  if (!url) throw new Error("Falta SVL_RUNNER_NBA_URL");
  if (!token) throw new Error("Falta SVL_RUNNER_TOKEN");

  const sep = url.indexOf("?") === -1 ? "?" : "&";
  const response = UrlFetchApp.fetch(
    url + sep + "token=" + encodeURIComponent(token),
    {
      method: "get",
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { "Accept": "application/json,text/plain,*/*" }
    }
  );

  Logger.log("HTTP " + response.getResponseCode());
  Logger.log(response.getContentText());

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Runner NBA respondió HTTP " + response.getResponseCode());
  }

  return response.getContentText();
}

function setBridgeToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Sports Value Lab Bridge",
    "Pega el token que te dio ChatGPT para SVL_BRIDGE_TOKEN:",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const token = response.getResponseText().trim();
  if (!token) throw new Error("Token vacío");
  PropertiesService.getScriptProperties().setProperty("SVL_BRIDGE_TOKEN", token);
  ui.alert("Token guardado. Ya puedes desplegar como Web app.");
}

function readPortfolio_() {
  const ss = SpreadsheetApp.openById(SVL.REGISTER);
  const values = ss.getSheetByName("Resumen").getRange("A1:D18").getDisplayValues();
  const map = {};
  values.forEach((row) => {
    if (row[0]) map[row[0]] = row[1];
  });

  return {
    bank: num_(map["Bank actual (u)"]),
    pnl: num_(map["Beneficio (u)"]),
    roi: num_(map["ROI"]),
    settledStake: num_(map["Stake liquidado (u)"]),
    picks: num_(map["Picks registrados"]),
    resolved: num_(map["Picks resueltos"]),
    pending: num_(map["Picks pendientes"]),
    hitRate: num_(map["Acierto pleno"]),
  };
}

function readPicks_() {
  const ss = SpreadsheetApp.openById(SVL.REGISTER);
  const sheet = ss.getSheetByName("Picks");
  if (!sheet) return [];

  const headerRow = 5;
  const lastRow = Math.max(sheet.getLastRow(), headerRow);
  const width = 19; // A:S, esquema CURRENT verificado
  const rows = sheet.getRange(headerRow, 1, lastRow - headerRow + 1, width).getDisplayValues();

  if (!rows.length) return [];
  const header = rows[0];

  return [header].concat(
    rows.slice(1).filter((row) =>
      row.slice(0, 17).some((value) => String(value || "").trim() !== "")
    )
  );
}

function readSport_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.id);
  return {
    control: readBounded_(ss.getSheetByName(cfg.control), 30, 26),
    continuity: readTail_(ss.getSheetByName(cfg.continuity), 12, 25),
    apiLog: readTail_(ss.getSheetByName(cfg.apiLog), 8, 26),
  };
}

function readBounded_(sheet, maxRows, maxCols) {
  if (!sheet) return [];
  const rows = Math.min(Math.max(sheet.getLastRow(), 1), maxRows);
  const cols = Math.min(Math.max(sheet.getLastColumn(), 1), maxCols);
  return sheet.getRange(1, 1, rows, cols).getDisplayValues();
}

function readTail_(sheet, tailRows, maxCols) {
  if (!sheet) return [];
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const cols = Math.min(Math.max(sheet.getLastColumn(), 1), maxCols);
  const header = sheet.getRange(1, 1, 1, cols).getDisplayValues()[0];
  if (lastRow === 1) return [header];

  const start = Math.max(2, lastRow - tailRows + 1);
  const rows = sheet.getRange(start, 1, lastRow - start + 1, cols).getDisplayValues();
  return [header].concat(rows);
}

function num_(value) {
  const n = Number(String(value || "").replace(/,/g, "").replace(/%/g, "").trim());
  return isFinite(n) ? n : 0;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
