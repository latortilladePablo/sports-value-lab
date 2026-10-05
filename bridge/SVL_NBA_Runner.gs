/**
 * SPORTS VALUE LAB — NBA SMART Runner v1
 *
 * Añadir como archivo nuevo al Apps Script SMART de NBA.
 * Reutiliza EXACTAMENTE las funciones existentes del script NBA.
 *
 * Script Property requerida:
 * SVL_RUNNER_TOKEN = secreto compartido con el bridge central
 */

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty("SVL_RUNNER_TOKEN");
  const supplied = e && e.parameter ? e.parameter.token : "";

  if (!expected || supplied !== expected) {
    return svlNBAJson_({ ok: false, error: "unauthorized" });
  }

  return svlNBAJson_({
    ok: true,
    sport: "NBA",
    actions: {
      P1_COMPLETO: "actualizarApuestasNBA",
      P2_CHECK: "revisarP2NBAGratis",
      P2_AUTO: "actualizarP2NBAAuto",
      P2_FORCE: "forzarP2NBAOdds"
    }
  });
}

function doPost(e) {
  let body = {};
  try {
    body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
  } catch (err) {
    return svlNBAJson_({ ok: false, error: "invalid_json" });
  }

  const expected = PropertiesService.getScriptProperties().getProperty("SVL_RUNNER_TOKEN");
  if (!expected || body.token !== expected) {
    return svlNBAJson_({ ok: false, error: "unauthorized" });
  }

  const action = String(body.action || "");

  if (action !== "P2_CHECK") {
    const scopeGuard = svlNBAScopeGuard_();
    if (!scopeGuard.ok) {
      return svlNBAJson_({
        ok: false,
        sport: "NBA",
        action: action,
        error: "scope_mismatch",
        detail: scopeGuard.detail,
        blockedCompetitions: scopeGuard.blockedCompetitions
      });
    }
  }

  const functions = {
    P1_COMPLETO: actualizarApuestasNBA,
    P2_CHECK: revisarP2NBAGratis,
    P2_AUTO: actualizarP2NBAAuto,
    P2_FORCE: forzarP2NBAOdds
  };
  const functionNames = {
    P1_COMPLETO: "actualizarApuestasNBA",
    P2_CHECK: "revisarP2NBAGratis",
    P2_AUTO: "actualizarP2NBAAuto",
    P2_FORCE: "forzarP2NBAOdds"
  };

  if (!functions[action]) {
    return svlNBAJson_({ ok: false, error: "invalid_action", action: action });
  }

  const startedAt = new Date();
  try {
    const result = functions[action]();
    return svlNBAJson_({
      ok: true,
      sport: "NBA",
      action: action,
      functionName: functionNames[action],
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      result: result === undefined ? null : result
    });
  } catch (err) {
    return svlNBAJson_({
      ok: false,
      sport: "NBA",
      action: action,
      functionName: functionNames[action],
      error: "execution_failed",
      detail: String(err && err.message ? err.message : err)
    });
  }
}

function svlNBAScopeGuard_() {
  const ss = SpreadsheetApp.openById("1vMBJfkLV-gBYMTU1zlU34bpAFNeCXACJSgdAAvO0nY4");
  const sheet = ss.getSheetByName("NBA_CONTROL");
  if (!sheet) {
    return {
      ok: false,
      detail: "NBA_CONTROL no existe; paid actions bloqueadas por seguridad.",
      blockedCompetitions: []
    };
  }

  const lastRow = Math.max(3, Math.min(sheet.getLastRow(), 20));
  const rows = sheet.getRange(3, 1, lastRow - 2, 2).getDisplayValues();
  const outOfScope = /preseason|summer league|play-in|playoffs?|finals?/i;
  const capturesOdds = /^s[ií]$|^yes$|^true$/i;

  const blocked = rows
    .filter(([competition, capture]) =>
      outOfScope.test(String(competition || "")) &&
      capturesOdds.test(String(capture || "").trim())
    )
    .map(([competition]) => competition);

  if (blocked.length) {
    return {
      ok: false,
      detail: "Paid NBA scan bloqueado: NBA_CONTROL aún habilita odds fuera del scope CURRENT.",
      blockedCompetitions: blocked
    };
  }

  return { ok: true, detail: "NBA scope CURRENT compatible.", blockedCompetitions: [] };
}

function svlNBAJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
