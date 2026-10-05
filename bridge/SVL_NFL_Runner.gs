/**
 * SPORTS VALUE LAB — NFL SMART Runner v1
 *
 * Script Property requerida:
 * SVL_RUNNER_TOKEN = secreto compartido con el bridge central
 */

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty("SVL_RUNNER_TOKEN");
  const supplied = e && e.parameter ? e.parameter.token : "";

  if (!expected || supplied !== expected) {
    return svlNFLJson_({ ok: false, error: "unauthorized" });
  }

  return svlNFLJson_({
    ok: true,
    sport: "NFL",
    actions: {
      P1_COMPLETO: "actualizarApuestasNFL",
      P2_CHECK: "revisarP2NFLGratis",
      P2_AUTO: "actualizarP2NFLAuto",
      P2_FORCE: "forzarP2NFLOdds"
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
    return svlNFLJson_({ ok: false, error: "invalid_json" });
  }

  const expected = PropertiesService.getScriptProperties().getProperty("SVL_RUNNER_TOKEN");
  if (!expected || body.token !== expected) {
    return svlNFLJson_({ ok: false, error: "unauthorized" });
  }

  const action = String(body.action || "");
  const functions = {
    P1_COMPLETO: actualizarApuestasNFL,
    P2_CHECK: revisarP2NFLGratis,
    P2_AUTO: actualizarP2NFLAuto,
    P2_FORCE: forzarP2NFLOdds
  };
  const functionNames = {
    P1_COMPLETO: "actualizarApuestasNFL",
    P2_CHECK: "revisarP2NFLGratis",
    P2_AUTO: "actualizarP2NFLAuto",
    P2_FORCE: "forzarP2NFLOdds"
  };

  if (!functions[action]) {
    return svlNFLJson_({ ok: false, error: "invalid_action", action: action });
  }

  const startedAt = new Date();
  try {
    const result = functions[action]();
    return svlNFLJson_({
      ok: true,
      sport: "NFL",
      action: action,
      functionName: functionNames[action],
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      result: result === undefined ? null : result
    });
  } catch (err) {
    return svlNFLJson_({
      ok: false,
      sport: "NFL",
      action: action,
      functionName: functionNames[action],
      error: "execution_failed",
      detail: String(err && err.message ? err.message : err)
    });
  }
}

function svlNFLJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
