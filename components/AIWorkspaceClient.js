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

export default function AIWorkspaceClient({ queue }) {
  const [copied, setCopied] = useState("");

  async function copyPrompt(item) {
    try {
      await navigator.clipboard.writeText(promptFor(item));
      setCopied(item.runId);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
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
            </div>

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
