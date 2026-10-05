"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  ["P1_COMPLETO", "P1 COMPLETO"],
  ["P2_CHECK", "CHECK P2"],
  ["P2_AUTO", "P2 AUTO"],
  ["P2_FORCE", "P2 FORCE"],
];

export default function ActionCenterClient({ sports }) {
  const router = useRouter();
  const [busy, setBusy] = useState({});
  const [bulkBusy, setBulkBusy] = useState("");
  const [messages, setMessages] = useState({});
  const [bulkMessage, setBulkMessage] = useState("");
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(sports.map((sport) => [sport.id, false]))
  );
  const [paidConfirm, setPaidConfirm] = useState({});
  const [materialConfirm, setMaterialConfirm] = useState({});
  const [bulkPaidConfirm, setBulkPaidConfirm] = useState(false);
  const [bulkMaterialConfirm, setBulkMaterialConfirm] = useState(false);

  const selectedIds = useMemo(
    () => sports.filter((sport) => selected[sport.id]).map((sport) => sport.id),
    [sports, selected]
  );

  function setSportBusy(key, value) {
    setBusy((state) => ({ ...state, [key]: value }));
  }

  function sportIsBusy(sportId) {
    return Object.entries(busy).some(([key, value]) => value && key.startsWith(sportId + ":"));
  }

  function selectAll() {
    setSelected(Object.fromEntries(sports.map((sport) => [sport.id, true])));
  }

  function clearSelection() {
    setSelected(Object.fromEntries(sports.map((sport) => [sport.id, false])));
  }

  function eligibleCount(action) {
    return sports.filter((sport) => selected[sport.id] && sport.policy[action]?.allowed).length;
  }

  async function run(sport, action) {
    const key = sport.id + ":" + action;
    setSportBusy(key, true);
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
    } catch {
      setMessages((m) => ({ ...m, [sport.id]: "✕ Error de conexión con el Action Center" }));
    } finally {
      setSportBusy(key, false);
    }
  }

  async function runBatch(action) {
    if (!selectedIds.length) {
      setBulkMessage("✕ Selecciona al menos un deporte.");
      return;
    }

    setBulkBusy(action);
    setBulkMessage("");
    setMessages((m) => {
      const next = { ...m };
      selectedIds.forEach((id) => { next[id] = ""; });
      return next;
    });

    try {
      const res = await fetch("/api/actions/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sports: selectedIds,
          action,
          confirmPaid: bulkPaidConfirm,
          materialTrigger: bulkMaterialConfirm,
        }),
      });
      const data = await res.json();

      if (Array.isArray(data.results)) {
        setMessages((m) => {
          const next = { ...m };
          data.results.forEach((result) => {
            next[result.sport] = result.ok
              ? `✓ ${result.name} completado`
              : result.status === "blocked"
                ? `↷ Omitido: ${result.error}`
                : `✕ ${result.error || "Error de ejecución"}`;
          });
          return next;
        });
      }

      setBulkMessage(
        data.ok
          ? `✓ Lote terminado: ${data.message}`
          : `✕ ${data.error || "No se pudo ejecutar el lote"}`
      );

      if (data.ok) router.refresh();
    } catch {
      setBulkMessage("✕ Error de conexión durante la ejecución por lote.");
    } finally {
      setBulkBusy("");
    }
  }

  return (
    <>
      <section className="batchPanel">
        <div className="batchTop">
          <div>
            <span className="eyebrow">EJECUCIÓN MÚLTIPLE</span>
            <h2>Seleccionar deportes</h2>
            <p>
              Ejecuta la misma acción en varios deportes a la vez. Cada deporte vuelve a pasar
              su gate CURRENT; los bloqueados se omiten sin detener los demás.
            </p>
          </div>
          <div className="batchCount">
            <strong>{selectedIds.length}</strong>
            <span>seleccionados</span>
          </div>
        </div>

        <div className="sportSelector">
          {sports.map((sport) => (
            <label key={sport.id} className={selected[sport.id] ? "selected" : ""}>
              <input
                type="checkbox"
                checked={!!selected[sport.id]}
                onChange={(e) =>
                  setSelected((state) => ({ ...state, [sport.id]: e.target.checked }))
                }
              />
              <span>{sport.icon}</span>
              <b>{sport.name}</b>
            </label>
          ))}
          <button type="button" onClick={selectAll}>Todos</button>
          <button type="button" onClick={clearSelection}>Ninguno</button>
        </div>

        <div className="batchActions">
          {ACTIONS.map(([id, label]) => {
            const eligible = eligibleCount(id);
            const isBusy = bulkBusy === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!selectedIds.length || bulkBusy !== ""}
                className={"batchAction " + (id === "P2_CHECK" ? "free" : "paid")}
                onClick={() => runBatch(id)}
              >
                <span>{label}</span>
                <small>
                  {eligible}/{selectedIds.length || 0} elegible(s)
                  {id === "P2_CHECK" ? " · 0 odds credits" : " · usa /odds"}
                </small>
                {isBusy ? <em>Ejecutando lote…</em> : null}
              </button>
            );
          })}
        </div>

        <div className="batchChecks">
          <label>
            <input
              type="checkbox"
              checked={bulkPaidConfirm}
              onChange={(e) => setBulkPaidConfirm(e.target.checked)}
            />
            Confirmo consumo de créditos para P1/AUTO/FORCE en los deportes elegibles seleccionados
          </label>
          <label>
            <input
              type="checkbox"
              checked={bulkMaterialConfirm}
              onChange={(e) => setBulkMaterialConfirm(e.target.checked)}
            />
            Confirmo que existe gatillo material para FORCE en los deportes seleccionados
          </label>
        </div>

        {bulkMessage ? <div className="bulkMessage">{bulkMessage}</div> : null}
      </section>

      <section className="actionSportGrid">
        {sports.map((sport) => (
          <article className={"actionSportCard " + (selected[sport.id] ? "selectedCard" : "")} key={sport.id}>
            <div className="actionSportTop">
              <div className="sportName">
                <label className="cardSelect" title="Seleccionar para ejecución múltiple">
                  <input
                    type="checkbox"
                    checked={!!selected[sport.id]}
                    onChange={(e) =>
                      setSelected((state) => ({ ...state, [sport.id]: e.target.checked }))
                    }
                  />
                </label>
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
                const disabled = !p.allowed || sportIsBusy(sport.id) || bulkBusy !== "";
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={disabled}
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
                    {busy[key] ? <em>Ejecutando…</em> : null}
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
    </>
  );
}
