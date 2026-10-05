import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "../../../components/AppNav";
import { getDashboardData } from "../../../lib/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function RunCard({ run }) {
  const analyzed = run.analysisStatus && run.analysisStatus !== "CHECK_ONLY_OR_NO_ODDS";
  return (
    <article className="runCard">
      <div className="runHeader">
        <div>
          <span className="eyebrow">{run.executedDisplay}</span>
          <h3>{run.mode}</h3>
        </div>
        <span className={"runState " + (analyzed ? "analyzed" : "")}>
          {run.analysisStatus || "sin análisis"}
        </span>
      </div>
      <div className="runStats">
        <div><span>Eventos</span><b>{run.events}</b></div>
        <div><span>Nuevos</span><b>{run.newEvents}</b></div>
        <div><span>Filas odds</span><b>{run.oddsRows}</b></div>
        <div><span>Créditos</span><b>{run.credits}</b></div>
      </div>
      <div className="runBody">
        <div><span>Snapshot / salida</span><code>{run.snapshot}</code></div>
        <div><span>Decisión</span><p>{run.decision || "—"}</p></div>
        {run.modelConfig ? <div><span>Modelo/config</span><p>{run.modelConfig}</p></div> : null}
        {run.optionsEvaluated ? <div><span>Opciones evaluadas</span><p>{run.optionsEvaluated}</p></div> : null}
        {run.discards ? <div><span>Descartes</span><p>{run.discards}</p></div> : null}
        {run.nextP2 ? <div><span>Próximo P2</span><p>{run.nextP2}</p></div> : null}
        {run.handoff ? <div><span>Handoff</span><p>{run.handoff}</p></div> : null}
      </div>
      <details>
        <summary>Metadatos</summary>
        <div className="detailsGrid">
          <span>Run ID</span><code>{run.runId}</code>
          <span>Cycle start</span><b>{run.cycleStart || "—"}</b>
          <span>Cutoff</span><b>{run.cutoff || "—"}</b>
          <span>P1 válido</span><b>{run.p1Valid ? "Sí" : "No"}</b>
        </div>
      </details>
    </article>
  );
}

function ApiRun({ run }) {
  return (
    <div className="apiRun">
      <div className="apiRunTop">
        <strong>{run.mode}</strong>
        <span>{run.executedDisplay}</span>
      </div>
      <div className="apiRunGrid">
        <span>Eventos <b>{run.events}</b></span>
        <span>Nuevos <b>{run.newEvents}</b></span>
        <span>Odds rows <b>{run.oddsRows}</b></span>
        <span>Créditos <b>{run.credits}</b></span>
        <span>Restantes <b>{run.creditsRemaining || "—"}</b></span>
      </div>
      {run.decision ? <p>{run.decision}</p> : null}
      {run.nextAction ? <small>{run.nextAction}</small> : null}
    </div>
  );
}

export default async function SportScanPage({ params }) {
  const { sport: slug } = await params;
  const data = await getDashboardData();
  const sport = data.sports.find((item) => item.id === slug);
  if (!sport) notFound();

  const status = data.statusMeta[sport.status];
  const scan = sport.scanData || {};
  const runs = [...(sport.runs || [])].reverse();
  const apiRuns = [...(sport.apiRuns || [])].reverse();

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>{sport.name} · Scan Timeline</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="scans" />

      <div className="breadcrumb">
        <Link href="/scans">Scans</Link><span>→</span><b>{sport.name}</b>
      </div>

      <section className="sportScanHero">
        <div className="sportScanTitle">
          <span className="sportIconLarge" aria-hidden>{sport.icon}</span>
          <div>
            <span className="eyebrow">{sport.scope}</span>
            <h1>{sport.name}</h1>
            <p>{sport.reason}</p>
          </div>
        </div>
        <span className={"badge largeBadge " + status.tone}>{status.label}</span>
      </section>

      <section className="scanSummaryRow">
        <div><span>Último modo</span><strong>{scan.lastMode || "—"}</strong></div>
        <div><span>Eventos</span><strong>{sport.events}</strong></div>
        <div><span>Nuevos</span><strong>{sport.newEvents}</strong></div>
        <div><span>Último snapshot odds</span><strong>{scan.latestOddsRows ?? 0} filas</strong></div>
        <div><span>Créditos restantes</span><strong>{scan.creditsRemaining || "—"}</strong><small>último valor registrado</small></div>
      </section>

      <section className="detailColumns">
        <div>
          <div className="sectionHead compactHead">
            <div>
              <span className="eyebrow">CONTINUITY</span>
              <h2>Timeline operativo</h2>
            </div>
            <span className="source">{runs.length} runs visibles</span>
          </div>
          <div className="timeline">
            {runs.length ? runs.map((run) => <RunCard key={run.runId} run={run} />) : (
              <div className="emptyState">No hay historial live disponible para este deporte.</div>
            )}
          </div>
        </div>

        <aside>
          <div className="sectionHead compactHead">
            <div>
              <span className="eyebrow">API_LOG</span>
              <h2>Capturas recientes</h2>
            </div>
          </div>
          <div className="apiList">
            {apiRuns.length ? apiRuns.map((run, index) => <ApiRun key={run.executedAt + index} run={run} />) : (
              <div className="emptyState">Sin API_LOG disponible.</div>
            )}
          </div>
        </aside>
      </section>

      <footer>
        <p>Detalle live de {sport.name}. Sólo lectura: no ejecuta endpoints de The Odds API.</p>
      </footer>
    </main>
  );
}
