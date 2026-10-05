/**
 * SPORTS VALUE LAB — Google Sheets Bridge v1
 *
 * Instalar como Apps Script vinculado a Sports_Value_Lab_Registro_CURRENT.
 * No publica ni modifica ningún Sheet. Sólo devuelve un JSON de lectura.
 */

const SVL = {
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
      portfolio: readPortfolio_(),
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
