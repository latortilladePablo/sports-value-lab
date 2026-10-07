"use client";

import { useState } from "react";

function promptFor(item) {
  const mode = String(item.mode || "");
  const isP1 = mode.startsWith("P1");
  const isForce = mode === "P2_FORCE";
  const isAuto = mode === "P2_AUTO";

  const common = [
    isP1 ? "P1" : "P2",
    "",
    isP1
      ? "Analiza el snapshot adjunto siguiendo Sports Value Lab CURRENT."
      : "Analiza el snapshot adjunto siguiendo Sports Value Lab CURRENT y continúa desde el handoff vigente.",
    `Deporte: ${item.sport}`,
    `Run ID: ${item.runId}`,
    `Modo: ${mode}`,
    `Snapshot: ${item.snapshot}`,
    "",
    "Carga y aplica la jerarquía CURRENT completa: CORE v3.0 > Prompt P1/P2 vigente > playbook vigente > Model Registry/Approval Protocol > config/modelo/dataset vigentes > Registro_CURRENT > CONTINUITY/handoff.",
    "Usa únicamente información prepartido para la decisión. No inventes probabilidades, cuotas, lesiones, starters, resultados, disponibilidad local ni calibración.",
    "Evalúa todas las líneas distintas y ambos lados de todos los mercados autorizados presentes en el snapshot; deduplica sólo repeticiones exactas.",
    "No fuerces picks. Registra únicamente picks definitivos que superen el estándar CURRENT, con stake entero defendible y sin duplicar picks ya registrados.",
    "Si faltan datos o contexto para defender p central/prudente, dilo y descarta o deja pendiente; no fabriques ventaja.",
  ];

  if (isP1) {
    common.push(
      "Audita primero la cobertura del snapshot frente a CONTINUITY/API_LOG y explica cualquier evento no materializable o diferencia de conteos sin inventar identidad ni precio."
    );
  }

  if (isForce) {
    common.push(
      "Este run es P2 FORCE: usa el motivo material que dejó el handoff previo (por ejemplo goalies, lesiones, lineup, clima, QB/contexto o repricing) y recalcula sólo lo afectado; FORCE no sustituye CHECK para descubrir eventos nuevos."
    );
  }

  if (isAuto) {
    common.push(
      "Este run es P2 AUTO: analiza las odds de eventos CURRENT nuevos detectados por el CHECK previo y evita reabrir eventos ya cubiertos salvo que el handoff lo exija explícitamente."
    );
  }

  common.push(
    "",
    "Cierra obligatoriamente con:",
    "1) Cobertura evaluada y descartes relevantes.",
    "2) Picks definitivos, si existen; si no, di 0 picks.",
    "3) Qué se registró o por qué no se registró.",
    "4) Próxima revisión P2 con fecha/ventana CDMX cuando sea defendible.",
    "5) Acción de captura exacta: NINGUNA | CHECK P2 | P2 AUTO | P2 FORCE.",
    "6) Actualiza CONTINUITY/handoff con el cierre del análisis cuando tengas acceso; si no, deja el texto exacto que debe marcarse en la web."
  );

  return common.join("\n");
}

function generalPromptFor(queue) {
  const lines = [
    "P1/P2 MULTIDEPORTE",
    "",
    "Analiza todos los snapshots adjuntos siguiendo Sports Value Lab CURRENT. Mantén cada archivo aislado por deporte y Run ID durante su evaluación, y sólo después compara los candidatos en el ranking global de la cartera.",
    "",
    "Snapshots adjuntos:"
  ];

  queue.forEach((item, index) => {
    lines.push(
      `${index + 1}) ${item.sport} · ${item.mode} · Run ID: ${item.runId} · Snapshot: ${item.snapshot}`
    );
  });

  lines.push(
    "",
    "Carga y aplica la jerarquía CURRENT completa: CORE v3.0 > sección P1/P2 vigente según el modo de cada Run ID > playbook vigente de cada deporte > Model Registry/Approval Protocol > config/modelo/dataset vigentes > Registro_CURRENT > CONTINUITY/handoff.",
    "Usa únicamente información prepartido para las decisiones. No inventes probabilidades, cuotas, noticias, lesiones, starters, resultados, disponibilidad local ni calibración.",
    "Para cada snapshot, evalúa sistemáticamente todos los eventos y todos los mercados autorizados presentes; conserva líneas distintas y ambos lados, y deduplica sólo repeticiones exactas.",
    "Si un archivo es P1, audita primero su cobertura frente a CONTINUITY/API_LOG. Si es P2 AUTO, analiza los eventos CURRENT nuevos del CHECK previo. Si es P2 FORCE, respeta el gatillo material del handoff previo y no lo uses como sustituto de discovery.",
    "No fuerces picks. Registra únicamente picks definitivos que superen el estándar CURRENT y no dupliques picks ya registrados.",
    "Después de terminar las evaluaciones por deporte, haz una selección GLOBAL entre todos los candidatos bajo el mismo estándar, reduciendo exposición cuando exista correlación. No hay cupos fijos por deporte.",
    "",
    "Cierra obligatoriamente con una sección por cada Run ID que incluya:",
    "1) Cobertura evaluada y descartes relevantes.",
    "2) Picks definitivos, si existen; si no, 0 picks.",
    "3) Qué se registró o por qué no se registró.",
    "4) Próxima revisión P2 con fecha/ventana CDMX cuando sea defendible.",
    "5) Acción de captura exacta por deporte: NINGUNA | CHECK P2 | P2 AUTO | P2 FORCE.",
    "6) Actualiza CONTINUITY/handoff de cada Run ID cuando tengas acceso; si no, deja el texto exacto que debe marcarse en la web.",
    "",
    "Finalmente presenta el ranking global de picks definitivos de todos los deportes, si existe alguno, sin aumentar stakes por cantidad de oportunidades."
  );

  return lines.join("\n");
}

export default function AIWorkspaceClient({ queue, history, handoffEnabled }) {
  const [copied, setCopied] = useState("");
  const [handoffRun, setHandoffRun] = useState("");
  const [nextAction, setNextAction] = useState("NINGUNA");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffConfirm, setHandoffConfirm] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [generalCopied, setGeneralCopied] = useState(false);

  async function copyGeneralPrompt() {
    try {
      await navigator.clipboard.writeText(generalPromptFor(queue));
      setGeneralCopied(true);
      window.setTimeout(() => setGeneralCopied(false), 1800);
    } catch {
      setGeneralCopied(false);
    }
  }

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

      {queue.length > 1 ? (
        <section className="multiSnapshotPrompt">
          <div>
            <span className="eyebrow">ANÁLISIS CONJUNTO</span>
            <h2>{queue.length} snapshots · un solo prompt</h2>
            <p>
              Descarga y adjunta todos los CSV pendientes al mismo chat del Project. Después pega este prompt:
              primero evalúa cada Run ID con sus reglas propias y al final aplica el ranking global de la cartera.
            </p>
          </div>
          <div className="multiSnapshotActions">
            <button type="button" onClick={copyGeneralPrompt}>
              {generalCopied ? "✓ Prompt general copiado" : "Copiar prompt general"}
            </button>
            <details>
              <summary>Ver prompt general</summary>
              <pre>{generalPromptFor(queue)}</pre>
            </details>
          </div>
        </section>
      ) : null}

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

      <section className="snapshotHistory">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">AUDITORÍA DE CAPTURAS</span>
            <h2>Historial de snapshots</h2>
          </div>
          <span className="source">{history.length} snapshot(s) cerrados · más reciente primero</span>
        </div>

        {history.length ? (
          <div className="snapshotHistoryList">
            {history.map((item) => (
              <article className="snapshotHistoryCard" key={item.runId}>
                <div className="snapshotHistoryTop">
                  <div>
                    <span className="eyebrow">{item.sport}</span>
                    <h3>{item.mode} · {item.snapshot}</h3>
                    <code>{item.runId}</code>
                  </div>
                  <span className="snapshotStatus">{item.analysisStatus || "SIN ESTADO"}</span>
                </div>

                <div className="snapshotHistoryMeta">
                  <div><span>Ejecutado</span><b>{item.executed}</b></div>
                  <div><span>Eventos</span><b>{item.events}</b></div>
                  <div><span>Filas odds</span><b>{item.oddsRows}</b></div>
                  <div><span>Créditos</span><b>{item.credits}</b></div>
                  <div><span>Picks</span><b>{item.picksRegistered || "0"}</b></div>
                </div>

                {(item.modelConfig || item.nextP2 || item.handoff) ? (
                  <details className="snapshotHistoryDetails">
                    <summary>Ver cierre / handoff</summary>
                    {item.modelConfig ? <p><strong>Modelo:</strong> {item.modelConfig}</p> : null}
                    {item.nextP2 ? <p><strong>Próximo P2:</strong> {item.nextP2}</p> : null}
                    {item.handoff ? <p><strong>Handoff:</strong> {item.handoff}</p> : null}
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="aiEmpty">
            <strong>Aún no hay snapshots cerrados en la ventana visible.</strong>
            <span>Los P1/P2 completados aparecerán aquí automáticamente.</span>
          </div>
        )}
      </section>
    </>
  );
}
