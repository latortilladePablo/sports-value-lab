import NewsWatchPanel from "../components/NewsWatchPanel";
import { getNewsWatch } from "../lib/news-watch";
import AppNav from "../components/AppNav";
import { getDashboardData } from "../lib/live";

export const revalidate = 20;

function Metric({ label, value, sub }) {
  return (
    <div className="metric">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
      {sub ? <div className="metricSub">{sub}</div> : null}
    </div>
  );
}

function SportCard({ sport, statusMeta }) {
  const meta = statusMeta[sport.status];
  return (
    <article className="sportCard">
      <div className="sportTop">
        <div className="sportName">
          <span className="sportIcon" aria-hidden>{sport.icon}</span>
          <div>
            <h3>{sport.name}</h3>
            <p>{sport.scope}</p>
          </div>
        </div>
        <span className={"badge " + meta.tone}>{meta.label}</span>
      </div>

      <div className="actionRow">
        <div>
          <span className="eyebrow">Siguiente</span>
          <strong>{sport.scan}</strong>
        </div>
        <div>
          <span className="eyebrow">Prompt</span>
          <strong>{sport.prompt}</strong>
        </div>
        <div>
          <span className="eyebrow">Créditos</span>
          <strong>{sport.credits}</strong>
        </div>
      </div>

      <p className="reason">{sport.reason}</p>

      <div className="cardFoot">
        <span>{sport.window}</span>
        <span>Último: {sport.lastRun}</span>
      </div>

      <details>
        <summary>Ver detalle operativo</summary>
        <div className="detailsGrid">
          <span>Run ID</span><code>{sport.run}</code>
          <span>Eventos</span><b>{sport.events}</b>
          <span>Nuevos</span><b>{sport.newEvents}</b>
        </div>
      </details>
    </article>
  );
}

export default async function Home() {
  const data = await getDashboardData();
  const news = await getNewsWatch(data.sports);
  const p = data.portfolio;
  const primary = data.primary;
  const primaryMeta = data.statusMeta[primary.status];
  const captureStatuses = new Set(["P1_REQUIRED","AUTO_REQUIRED","CHECK_REQUIRED","FORCE_RECOMMENDED"]);
  const captureNow = data.sports.filter((s) => captureStatuses.has(s.status));
  const chatgptPending = data.sports.filter((s) => s.status === "CHATGPT_REQUIRED");
  const scopeErrors = data.sports.filter((s) => s.status === "ERROR");
  const cdmxWeekday = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
  }).format(new Date());
  const systemBlockNow = cdmxWeekday.toLowerCase().startsWith("lunes");

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · Control Center</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="hoy" />

      {!data.live ? (
        <section className="fallbackNotice">
          Fuente live aún no conectada. La app sigue operativa con el último snapshot seguro.
          {data.fallbackReason ? <small>{data.fallbackReason}</small> : null}
        </section>
      ) : null}

      <section className="hero">
        <div>
          <span className="eyebrow">AHORA</span>
          <h1>{primary.icon} {primary.name}</h1>
          <p>{primary.reason}</p>
        </div>
        <div className={"heroAction " + primaryMeta.tone}>
          <span>{primaryMeta.label}</span>
          <strong>{primary.scan}</strong>
          <small>{primary.window}</small>
        </div>
      </section>

      <NewsWatchPanel news={news} />

      <section className="metrics" aria-label="Portfolio">
        <Metric label="Bank" value={Number(p.bank).toFixed(2) + "u"} sub="Inicial 200u" />
        <Metric label="P&L" value={Number(p.pnl).toFixed(2) + "u"} sub={"ROI " + Number(p.roi).toFixed(2) + "%"} />
        <Metric label="Picks" value={p.resolved + "/" + p.picks} sub={p.pending + " pendientes"} />
        <Metric label="Stake liquidado" value={Number(p.settledStake).toFixed(0) + "u"} sub={"Acierto pleno " + Number(p.hitRate).toFixed(1) + "%"} />
      </section>

      <section className="opsChecklist">
        <div className="opsChecklistHead">
          <div>
            <span className="eyebrow">NO PERDER NADA</span>
            <h2>Control operativo</h2>
          </div>
          <span className="source">America/Mexico_City · {cdmxWeekday}</span>
        </div>
        <div className="opsChecklistGrid">
          <a href="/actions" className={captureNow.length ? "attention" : ""}>
            <span>Capturas</span>
            <strong>{captureNow.length ? captureNow.length + " acción(es)" : "Al día"}</strong>
            <small>{captureNow.length ? captureNow.map((s)=>s.name + ": " + s.scan).join(" · ") : "Sin P1/P2 de captura pendiente"}</small>
          </a>
          <a href="/ai" className={chatgptPending.length ? "attention" : ""}>
            <span>ChatGPT</span>
            <strong>{chatgptPending.length} snapshot(s)</strong>
            <small>{chatgptPending.length ? "Descargar, subir al Project y ejecutar P1/P2 antes de nuevas compras" : "Sin análisis P1/P2 pendiente"}</small>
          </a>
          <a href="/picks?tab=activos">
            <span>P3 / Picks</span>
            <strong>{p.pending} pendiente(s)</strong>
            <small>{p.pending ? "Liquidar/verificar cuando los eventos terminen" : "Registro sin posiciones abiertas"}</small>
          </a>
          <div className={systemBlockNow ? "attention" : ""}>
            <span>Sistema / Model review</span>
            <strong>{systemBlockNow ? "P5 → P3 → P4 ligero" : "Próximo lunes"}</strong>
            <small>{systemBlockNow ? "Actualizar datos, liquidar y revisar rendimiento/calibración" : "P5 → P3 → P4 ligero para no perder mejoras de modelo"}</small>
          </div>
          {scopeErrors.length ? (
            <div className="opsError">
              <span>Incidencias</span>
              <strong>{scopeErrors.length} bloqueo(s)</strong>
              <small>{scopeErrors.map((s)=>s.name + ": " + s.reason).join(" · ")}</small>
            </div>
          ) : null}
        </div>
      </section>

      <section className="sectionHead">
        <div>
          <span className="eyebrow">5 DEPORTES</span>
          <h2>Qué toca ahora</h2>
        </div>
        <span className="source">{data.source}</span>
      </section>

      <section className="cards">
        {data.orderedSports.map((sport) => (
          <SportCard key={sport.id} sport={sport} statusMeta={data.statusMeta} />
        ))}
      </section>

      <section className="queue">
        <div>
          <span className="eyebrow">CHATGPT QUEUE</span>
          <h2>{data.sports.some((s) => s.status === "CHATGPT_REQUIRED") ? "Hay análisis pendientes" : "Sin snapshots pendientes"}</h2>
          <p>
            {data.sports.some((s) => s.status === "CHATGPT_REQUIRED")
              ? "Hay un P1/P2 capturado pendiente de analizar en ChatGPT antes de volver a comprar odds."
              : "No hay snapshot capturado pendiente de análisis según el estado CURRENT."}
          </p>
        </div>
        <div className="queueState">
          {data.sports.filter((s) => s.status === "CHATGPT_REQUIRED").length} pendientes
        </div>
      </section>

      <footer>
        <p>V1.1 · Sheets siguen siendo la fuente de verdad. La web sólo lee y deriva el estado operativo.</p>
      </footer>
    </main>
  );
}
