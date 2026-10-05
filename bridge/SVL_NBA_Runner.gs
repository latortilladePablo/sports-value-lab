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

function svlNBAJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
