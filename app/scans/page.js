import Link from "next/link";
import AppNav from "../../components/AppNav";
import { getDashboardData } from "../../lib/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function ScanCard({ sport, statusMeta }) {
  const meta = statusMeta[sport.status];
  const scan = sport.scanData || {};

  return (
    <article className="scanCard">
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

      <div className="scanMode">
        <div>
          <span className="eyebrow">ÚLTIMO SCAN</span>
          <strong>{scan.lastMode || "—"}</strong>
        </div>
        <span>{sport.lastRun}</span>
      </div>

      <div className="scanMetrics">
        <div><span>Eventos</span><b>{sport.events}</b></div>
        <div><span>Nuevos</span><b>{sport.newEvents}</b></div>
        <div><span>Filas odds</span><b>{scan.latestOddsRows ?? 0}</b></div>
        <div><span>Créditos run</span><b>{scan.latestCredits ?? 0}</b></div>
      </div>

      <div className="scanMeta">
        <div>
          <span>Último snapshot odds</span>
          <code>{scan.latestOddsSnapshot || "—"}</code>
        </div>
        <div>
          <span>Estado análisis</span>
          <b>{scan.latestAnalysisStatus || "—"}</b>
        </div>
        <div>
          <span>Créditos restantes</span>
          <b>{scan.creditsRemaining || "—"}</b>
          <small>{scan.creditsRemainingLabel || "último valor registrado"}</small>
        </div>
        <div>
          <span>Próxima revisión</span>
          <b>{scan.nextReview || sport.window || "—"}</b>
        </div>
      </div>

      <Link className="scanLink" href={"/scans/" + sport.id}>
        Abrir timeline <span>→</span>
      </Link>
    </article>
  );
}

export default async function ScansPage() {
  const data = await getDashboardData();
  const totalEvents = data.sports.reduce((sum, s) => sum + Number(s.events || 0), 0);
  const totalNew = data.sports.reduce((sum, s) => sum + Number(s.newEvents || 0), 0);
  const totalLatestOddsRows = data.sports.reduce((sum, s) => sum + Number(s.scanData?.latestOddsRows || 0), 0);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · Scan Center</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="scans" />

      {!data.live ? (
        <section className="fallbackNotice">
          Fuente live no disponible. Scans muestra el último estado seguro.
          {data.fallbackReason ? <small>{data.fallbackReason}</small> : null}
        </section>
      ) : null}

      <section className="scanHero">
        <div>
          <span className="eyebrow">OPERACIÓN LIVE</span>
          <h1>Scans</h1>
          <p>
            CONTROL, CONTINUITY y API_LOG de los cinco deportes en una sola vista.
            Los créditos se muestran como último valor registrado, no como saldo en tiempo real.
          </p>
        </div>
        <div className="scanHeroStats">
          <div><span>Deportes</span><strong>5</strong></div>
          <div><span>Eventos último run</span><strong>{totalEvents}</strong></div>
          <div><span>Nuevos último run</span><strong>{totalNew}</strong></div>
          <div><span>Filas último snapshot</span><strong>{totalLatestOddsRows}</strong></div>
        </div>
      </section>

      <section className="sectionHead">
        <div>
          <span className="eyebrow">SMART WORKFLOW</span>
          <h2>Estado por deporte</h2>
        </div>
        <span className="source">{data.source}</span>
      </section>

      <section className="scanGrid">
        {data.sports.map((sport) => (
          <ScanCard key={sport.id} sport={sport} statusMeta={data.statusMeta} />
        ))}
      </section>

      <footer>
        <p>Scans V1 · Lectura live. Esta pantalla no ejecuta CHECK/AUTO/FORCE ni consume créditos.</p>
      </footer>
    </main>
  );
}
