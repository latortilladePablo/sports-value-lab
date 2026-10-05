"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  ["P1_COMPLETO", "P1 COMPLETO"],
  ["P2_CHECK", "CHECK P2"],
  ["P2_AUTO", "P2 AUTO"],
  ["P2_FORCE", "P2 FORCE"],
];

export default function ActionCenterClient({ sports }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [messages, setMessages] = useState({});
  const [paidConfirm, setPaidConfirm] = useState({});
  const [materialConfirm, setMaterialConfirm] = useState({});

  async function run(sport, action) {
    const key = sport.id + ":" + action;
    setBusy(key);
    setMessages((m) => ({ ...m, [sport.id]: "" }));

    try {
      const res = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sport: sport.id,
          action,
          confirmPaid: !!paidConfirm[sport.id],
          materialTrigger: !!materialConfirm[sport.id],
        }),
      });
      const data = await res.json();
      setMessages((m) => ({
        ...m,
        [sport.id]: data.ok
          ? `✓ ${data.message || "Ejecución aceptada"}`
          : `✕ ${data.error || "No se pudo ejecutar"}`,
      }));
      if (data.ok) router.refresh();
    } catch (err) {
      setMessages((m) => ({ ...m, [sport.id]: "✕ Error de conexión con el Action Center" }));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="actionSportGrid">
      {sports.map((sport) => (
        <article className="actionSportCard" key={sport.id}>
          <div className="actionSportTop">
            <div className="sportName">
              <span className="sportIcon" aria-hidden>{sport.icon}</span>
              <div>
                <h3>{sport.name}</h3>
                <p>{sport.scope}</p>
              </div>
            </div>
            <span className={"runnerPill " + (sport.runnerConfigured ? "ready" : "off")}>
              {sport.runnerConfigured ? "Runner conectado" : "Runner pendiente"}
            </span>
          </div>

          <div className="engineStrip">
            <div><span>Motor</span><strong>{sport.scan}</strong></div>
            <div><span>Estado</span><strong>{sport.statusLabel}</strong></div>
            <div><span>Último</span><strong>{sport.lastRun}</strong></div>
          </div>

          <p className="actionReason">{sport.reason}</p>

          <div className="actionButtons">
            {ACTIONS.map(([id, label]) => {
              const p = sport.policy[id];
              const key = sport.id + ":" + id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!p.allowed || busy !== "" }
                  className={
                    "scanActionButton " +
                    (id === "P2_CHECK" ? "free" : "paid") +
                    (!p.allowed ? " disabled" : "")
                  }
                  onClick={() => run(sport, id)}
                  title={p.reason}
                >
                  <span>{label}</span>
                  <small>{id === "P2_CHECK" ? "0 odds credits" : "usa /odds"}</small>
                  {busy === key ? <em>Ejecutando…</em> : null}
                </button>
              );
            })}
          </div>

          <div className="actionChecks">
            <label>
              <input
                type="checkbox"
                checked={!!paidConfirm[sport.id]}
                onChange={(e) => setPaidConfirm((x) => ({ ...x, [sport.id]: e.target.checked }))}
              />
              Confirmo consumo de créditos para P1/AUTO/FORCE
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!materialConfirm[sport.id]}
                onChange={(e) => setMaterialConfirm((x) => ({ ...x, [sport.id]: e.target.checked }))}
              />
              Confirmo gatillo material para FORCE
            </label>
          </div>

          <div className="actionPolicyList">
            {ACTIONS.map(([id, label]) => (
              <div key={id}>
                <span>{label}</span>
                <b className={sport.policy[id].eligible ? "eligible" : ""}>
                  {sport.policy[id].reason}
                </b>
              </div>
            ))}
          </div>

          {messages[sport.id] ? <div className="actionMessage">{messages[sport.id]}</div> : null}
        </article>
      ))}
    </section>
  );
}
