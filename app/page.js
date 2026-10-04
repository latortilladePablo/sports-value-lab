import { orderedSports, primaryAction, snapshot, statusMeta } from "../lib/state";

function Metric({ label, value, sub }) {
  return (
    <div className="metric">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
      {sub ? <div className="metricSub">{sub}</div> : null}
    </div>
  );
}

function SportCard({ sport }) {
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

export default function Home() {
  const p = snapshot.portfolio;
  const primary = primaryAction();
  const primaryMeta = statusMeta[primary.status];

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
        <span className="sync">● Snapshot {snapshot.capturedAt}</span>
      </header>

      <nav className="nav" aria-label="Principal">
        <span className="navActive">Hoy</span>
        <span>Scans</span>
        <span>Picks</span>
        <span>Portfolio</span>
        <span>Más</span>
      </nav>

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
        <Metric label="Bank" value={p.bank.toFixed(2) + "u"} sub="Inicial 200u" />
        <Metric label="P&L" value={p.pnl.toFixed(2) + "u"} sub={"ROI " + p.roi.toFixed(2) + "%"} />
        <Metric label="Picks" value={p.resolved + "/" + p.picks} sub={p.pending + " pendientes"} />
        <Metric label="Stake liquidado" value={p.settledStake.toFixed(0) + "u"} sub={"Acierto pleno " + p.hitRate.toFixed(1) + "%"} />
      </section>

      <section className="sectionHead">
        <div>
          <span className="eyebrow">5 DEPORTES</span>
          <h2>Qué toca ahora</h2>
        </div>
        <span className="source">{snapshot.source}</span>
      </section>

      <section className="cards">
        {orderedSports().map((sport) => <SportCard key={sport.id} sport={sport} />)}
      </section>

      <section className="queue">
        <div>
          <span className="eyebrow">CHATGPT QUEUE</span>
          <h2>Sin snapshots pendientes</h2>
          <p>Los últimos CHECK de NHL y Tennis no produjeron odds. No hay archivo nuevo que adjuntar antes de otra decisión.</p>
        </div>
        <div className="queueState">0 pendientes</div>
      </section>

      <footer>
        <p>V1 · Los datos de esta pantalla son un snapshot CURRENT leído de Google Sheets. La conexión live será el siguiente paso.</p>
      </footer>
    </main>
  );
}
