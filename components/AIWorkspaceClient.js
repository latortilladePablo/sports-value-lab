"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AIWorkspaceClient({ queue, authorized, securityConfigured, openaiConfigured, model }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/ai/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!data.ok) {
        setLoginError(data.error || "No se pudo iniciar sesión.");
        return;
      }
      setToken("");
      router.refresh();
    } catch {
      setLoginError("Error de conexión.");
    }
  }

  async function analyze(item) {
    setBusy(item.runId);
    setErrors((x) => ({ ...x, [item.runId]: "" }));
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sport: item.sportId, runId: item.runId }),
      });
      const data = await response.json();
      if (!data.ok) {
        setErrors((x) => ({ ...x, [item.runId]: data.error || "No se pudo analizar." }));
        return;
      }
      setResults((x) => ({ ...x, [item.runId]: data }));
    } catch {
      setErrors((x) => ({ ...x, [item.runId]: "Error de conexión durante el análisis." }));
    } finally {
      setBusy("");
    }
  }

  if (!securityConfigured || !openaiConfigured) {
    return (
      <section className="aiSetup">
        <div>
          <span className="eyebrow">CONFIGURACIÓN REQUERIDA</span>
          <h2>AI Workspace construido, ejecución cerrada</h2>
          <p>
            Falta configurar {securityConfigured ? "" : "SVL_AI_ACCESS_TOKEN"}
            {!securityConfigured && !openaiConfigured ? " y " : ""}
            {openaiConfigured ? "" : "OPENAI_API_KEY"} en Vercel. Hasta entonces ningún botón puede generar coste.
          </p>
        </div>
        <span className="aiLock">LOCKED</span>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section className="aiLogin">
        <div>
          <span className="eyebrow">OWNER ACCESS</span>
          <h2>Desbloquear análisis AI</h2>
          <p>La sesión se guarda en una cookie HttpOnly durante 12 horas. La clave no se guarda en el navegador.</p>
        </div>
        <form onSubmit={login}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="SVL AI access token"
            autoComplete="current-password"
          />
          <button type="submit">Entrar</button>
          {loginError ? <small>{loginError}</small> : null}
        </form>
      </section>
    );
  }

  return (
    <>
      <section className="aiStatusBar">
        <div><span>Modelo</span><strong>{model}</strong></div>
        <div><span>Acceso</span><strong>Propietario</strong></div>
        <div><span>Registro</span><strong>AI_ANALYSIS_LOG</strong></div>
        <div><span>Auto-registro picks</span><strong>Desactivado</strong></div>
      </section>

      <section className="aiQueue">
        {queue.length === 0 ? (
          <div className="aiEmpty">
            <strong>No hay snapshots P1/P2 pendientes en la ventana visible.</strong>
            <span>Cuando Action Center capture uno, aparecerá aquí para revisión.</span>
          </div>
        ) : queue.map((item) => {
          const result = results[item.runId];
          const error = errors[item.runId];
          return (
            <article className="aiRunCard" key={item.runId}>
              <div className="aiRunTop">
                <div>
                  <span className="eyebrow">{item.sport}</span>
                  <h3>{item.mode} · {item.snapshot}</h3>
                  <code>{item.runId}</code>
                </div>
                <span className={"aiGate " + (item.blocked ? "blocked" : "ready")}>
                  {item.blocked ? "BLOQUEADO" : item.analysisStatus}
                </span>
              </div>

              <div className="aiRunMeta">
                <div><span>Ejecutado</span><b>{item.executed}</b></div>
                <div><span>Eventos</span><b>{item.events}</b></div>
                <div><span>Filas odds</span><b>{item.oddsRows}</b></div>
                <div><span>Créditos</span><b>{item.credits}</b></div>
              </div>

              {item.blocked ? <p className="aiBlockedReason">{item.blockReason}</p> : null}

              <button
                type="button"
                className="aiAnalyzeButton"
                disabled={item.blocked || busy !== ""}
                onClick={() => analyze(item)}
              >
                {busy === item.runId ? "Analizando…" : "Analizar snapshot"}
              </button>

              {error ? <div className="aiError">{error}</div> : null}

              {result ? (
                <div className="aiResult">
                  <div className="aiResultMeta">
                    <span>{result.model}</span>
                    <code>{result.conversationId}</code>
                    <b>REVISIÓN REQUERIDA</b>
                  </div>
                  <pre>{result.output || "Respuesta sin texto."}</pre>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
