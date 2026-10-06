"use client";

import { useState } from "react";

function promptFor(item) {
  const prompt = String(item.mode || "").startsWith("P1") ? "P1" : "P2";
  if (prompt === "P1") {
    return [
      "P1",
      "",
      "Analiza el snapshot adjunto siguiendo Sports Value Lab CURRENT.",
      `Deporte: ${item.sport}`,
      `Run ID: ${item.runId}`,
      `Snapshot: ${item.snapshot}`,
      "",
      "Carga CORE v3.0, Prompt P1, Model Registry/Approval Protocol, playbook/config/modelo/dataset vigentes, Registro_CURRENT y continuity/handoff. Evalúa todo el universo autorizado del snapshot, no fuerces picks, registra sólo picks definitivos que superen el estándar y cierra con Próxima revisión P2 + Acción de captura."
    ].join("\n");
  }

  return [
    "P2",
    "",
    "Analiza el snapshot adjunto siguiendo Sports Value Lab CURRENT y continúa desde el handoff vigente.",
    `Deporte: ${item.sport}`,
    `Run ID: ${item.runId}`,
    `Snapshot: ${item.snapshot}`,
    "",
    "Carga CORE v3.0, Prompt P2, Model Registry/Approval Protocol, playbook/config/modelo/dataset vigentes, Registro_CURRENT y continuity/handoff. Reevalúa únicamente con información prepartido, no dupliques picks ya registrados y cierra con Próxima revisión P2 + Acción de captura."
  ].join("\n");
}

export default function AIWorkspaceClient({ queue, handoffEnabled }) {
  const [copied, setCopied] = useState("");
  const [handoffRun, setHandoffRun] = useState("");
  const [nextAction, setNextAction] = useState("NINGUNA");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffConfirm, setHandoffConfirm] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState("");
  const [handoffError, setHandoffError] = useState("");

  async function copyPrompt(item) {
    try {
      await navigator.clipboard.writeText(promptFor(item));
      setCopied(item.runId);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  function openHandoff(item) {
    setHandoffRun(item.runId);
    setNextAction("NINGUNA");
    setHandoffNote("");
    setHandoffConfirm(false);
    setHandoffError("");
  }

  async function completeHandoff(item) {
    setHandoffBusy(item.runId);
    setHandoffError("");
    try {
      const response = await fetch("/api/chatgpt/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sport: item.sportId,
          runId: item.runId,
          nextAction,
          note: handoffNote,
          confirm: handoffConfirm,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setHandoffError(data.error || "No se pudo cerrar el análisis.");
        return;
      }
      window.location.reload();
    } catch {
      setHandoffError("Error de conexión al cerrar el handoff.");
    } finally {
      setHandoffBusy("");
    }
  }

  return (
    <>
      <section className="chatgptWorkflow">
        <div>
          <span className="eyebrow">FLUJO RECOMENDADO</span>
          <h2>La web captura. Este Project analiza.</h2>
          <p>
            1) Ejecuta la acción indicada en Hoy/Acciones. 2) Descarga aquí el snapshot.
            3) Súbelo a una conversación de Sports Value Lab en ChatGPT. 4) Pega el prompt generado.
          </p>
        </div>
        <div className="workflowSteps">
          <span>SCAN</span><b>→</b><span>CSV</span><b>→</b><span>CHATGPT PROJECT</span><b>→</b><span>P1 / P2</span>
        </div>
      </section>

      <section className="aiQueue">
        {queue.length === 0 ? (
          <div className="aiEmpty">
            <strong>No hay snapshots P1/P2 pendientes en la ventana visible.</strong>
            <span>Cuando Action Center capture uno que requiera análisis, aparecerá aquí.</span>
          </div>
        ) : queue.map((item) => (
          <article className="aiRunCard" key={item.runId}>
            <div className="aiRunTop">
              <div>
                <span className="eyebrow">{item.sport}</span>
                <h3>{item.mode} · {item.snapshot}</h3>
                <code>{item.runId}</code>
              </div>
              <span className={"aiGate " + (item.blocked ? "blocked" : "ready")}>
                {item.blocked ? "BLOQUEADO" : "LISTO PARA CHATGPT"}
              </span>
            </div>

            <div className="aiRunMeta">
              <div><span>Ejecutado</span><b>{item.executed}</b></div>
              <div><span>Eventos</span><b>{item.events}</b></div>
              <div><span>Filas odds</span><b>{item.oddsRows}</b></div>
              <div><span>Créditos</span><b>{item.credits}</b></div>
            </div>

            {item.blocked ? <p className="aiBlockedReason">{item.blockReason}</p> : null}

            <div className="chatgptActions">
              {item.blocked ? (
                <button type="button" disabled>Descarga bloqueada</button>
              ) : (
                <a href={"/api/export/snapshot?sport=" + encodeURIComponent(item.sportId) + "&runId=" + encodeURIComponent(item.runId)}>
                  Descargar CSV
                </a>
              )}
              <button type="button" disabled={item.blocked} onClick={() => copyPrompt(item)}>
                {copied === item.runId ? "✓ Copiado" : "Copiar prompt " + (String(item.mode).startsWith("P1") ? "P1" : "P2")}
              </button>
              <button
                type="button"
                disabled={item.blocked || !handoffEnabled}
                title={handoffEnabled ? "Cerrar este Run ID tras analizarlo en ChatGPT" : "Publica bridge v1.2-chatgpt-handoff para habilitar este control"}
                onClick={() => openHandoff(item)}
              >
                {handoffEnabled ? "Marcar análisis completado" : "Handoff web · requiere bridge v1.2"}
              </button>
            </div>

            {handoffRun === item.runId ? (
              <div className="chatgptHandoff">
                <div>
                  <span className="eyebrow">VUELTA DESDE CHATGPT</span>
                  <strong>¿Qué acción te indicó el análisis?</strong>
                  <p>Esto sólo cierra este Run ID y comunica el siguiente paso al motor CURRENT.</p>
                </div>
                <label>
                  Siguiente acción
                  <select value={nextAction} onChange={(e) => setNextAction(e.target.value)}>
                    <option value="NINGUNA">NINGUNA / esperar</option>
                    <option value="CHECK_P2">CHECK P2</option>
                    <option value="P2_FORCE">P2 FORCE</option>
                  </select>
                </label>
                <label>
                  Nota / handoff opcional
                  <textarea
                    value={handoffNote}
                    onChange={(e) => setHandoffNote(e.target.value)}
                    placeholder="Ej.: FORCE por goalies/lesiones/contexto material; después CHECK mañana 10–12 CDMX."
                    maxLength={1200}
                  />
                </label>
                <label className="handoffConfirm">
                  <input
                    type="checkbox"
                    checked={handoffConfirm}
                    onChange={(e) => setHandoffConfirm(e.target.checked)}
                  />
                  Confirmo que este Run ID ya fue analizado en el Project Sports Value Lab.
                </label>
                {handoffError ? <div className="aiError">{handoffError}</div> : null}
                <div className="handoffButtons">
                  <button type="button" onClick={() => setHandoffRun("")}>Cancelar</button>
                  <button
                    type="button"
                    disabled={!handoffConfirm || handoffBusy !== ""}
                    onClick={() => completeHandoff(item)}
                  >
                    {handoffBusy === item.runId ? "Guardando…" : "Confirmar handoff"}
                  </button>
                </div>
              </div>
            ) : null}

            <details className="chatgptPromptPreview">
              <summary>Ver texto que debes pegar en ChatGPT</summary>
              <pre>{promptFor(item)}</pre>
            </details>
          </article>
        ))}
      </section>
    </>
  );
}
