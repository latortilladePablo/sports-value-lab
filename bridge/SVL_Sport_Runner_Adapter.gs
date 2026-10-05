/**
 * SPORTS VALUE LAB — Sport Runner Adapter v1
 *
 * Añadir este archivo al Apps Script SMART existente de UN deporte.
 * No contiene lógica de Odds API. Sólo expone de forma segura las funciones
 * que el script ya usa para P1/CHECK/AUTO/FORCE.
 *
 * Script Properties requeridas:
 * SVL_RUNNER_TOKEN
 * SVL_FN_P1_COMPLETO
 * SVL_FN_P2_CHECK
 * SVL_FN_P2_AUTO
 * SVL_FN_P2_FORCE
 */

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("SVL_RUNNER_TOKEN");
  const supplied = e && e.parameter ? e.parameter.token : "";

  if (!expected || supplied !== expected) {
    return svlRunnerJson_({ ok: false, error: "unauthorized" });
  }

  return svlRunnerJson_({
    ok: true,
    configured: svlRunnerConfig_()
  });
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("SVL_RUNNER_TOKEN");
  let body = {};

  try {
    body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
  } catch (err) {
    return svlRunnerJson_({ ok: false, error: "invalid_json" });
  }

  if (!expected || body.token !== expected) {
    return svlRunnerJson_({ ok: false, error: "unauthorized" });
  }

  const action = String(body.action || "");
  const propertyByAction = {
    P1_COMPLETO: "SVL_FN_P1_COMPLETO",
    P2_CHECK: "SVL_FN_P2_CHECK",
    P2_AUTO: "SVL_FN_P2_AUTO",
    P2_FORCE: "SVL_FN_P2_FORCE"
  };

  const propertyName = propertyByAction[action];
  if (!propertyName) {
    return svlRunnerJson_({ ok: false, error: "invalid_action" });
  }

  const functionName = props.getProperty(propertyName);
  if (!functionName) {
    return svlRunnerJson_({
      ok: false,
      error: "function_mapping_missing",
      property: propertyName
    });
  }

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName)) {
    return svlRunnerJson_({ ok: false, error: "invalid_function_name" });
  }

  const fn = globalThis[functionName];
  if (typeof fn !== "function") {
    return svlRunnerJson_({
      ok: false,
      error: "function_not_found",
      functionName: functionName
    });
  }

  const startedAt = new Date();
  try {
    const result = fn();
    return svlRunnerJson_({
      ok: true,
      action: action,
      functionName: functionName,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      result: result === undefined ? null : result
    });
  } catch (err) {
    return svlRunnerJson_({
      ok: false,
      error: "execution_failed",
      action: action,
      functionName: functionName,
      detail: String(err && err.message ? err.message : err)
    });
  }
}

function svlRunnerConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    P1_COMPLETO: !!props.getProperty("SVL_FN_P1_COMPLETO"),
    P2_CHECK: !!props.getProperty("SVL_FN_P2_CHECK"),
    P2_AUTO: !!props.getProperty("SVL_FN_P2_AUTO"),
    P2_FORCE: !!props.getProperty("SVL_FN_P2_FORCE")
  };
}

function svlRunnerJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
