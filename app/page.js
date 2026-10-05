import AppNav from "../components/AppNav";
import { getDashboardData } from "../lib/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const p = data.portfolio;
  const primary = data.primary;
  const primaryMeta = data.statusMeta[primary.status];

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

      <section className="metrics" aria-label="Portfolio">
        <Metric label="Bank" value={Number(p.bank).toFixed(2) + "u"} sub="Inicial 200u" />
        <Metric label="P&L" value={Number(p.pnl).toFixed(2) + "u"} sub={"ROI " + Number(p.roi).toFixed(2) + "%"} />
        <Metric label="Picks" value={p.resolved + "/" + p.picks} sub={p.pending + " pendientes"} />
        <Metric label="Stake liquidado" value={Number(p.settledStake).toFixed(0) + "u"} sub={"Acierto pleno " + Number(p.hitRate).toFixed(1) + "%"} />
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
