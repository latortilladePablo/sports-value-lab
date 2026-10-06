import AppNav from "../../components/AppNav";
import AIWorkspaceClient from "../../components/AIWorkspaceClient";
import { getDashboardData } from "../../lib/live";

export const revalidate = 20;

export default async function ChatGPTWorkspacePage() {
  const data = await getDashboardData();

  const queue = data.sports.flatMap((sport) =>
    sport.runs
      .filter((run) =>
        /^(P1|P2_AUTO|P2_FORCE)/.test(String(run.mode || "")) &&
        /PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || "")
      )
      .map((run) => ({
        sportId: sport.id,
        sport: sport.name,
        mode: run.mode,
        runId: run.runId,
        snapshot: run.snapshot,
        analysisStatus: run.analysisStatus,
        executed: run.executedDisplay,
        events: run.events,
        oddsRows: run.oddsRows,
        credits: run.credits,
        blocked: sport.status === "ERROR",
        blockReason: sport.status === "ERROR" ? sport.reason : "",
      }))
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · ChatGPT Workspace</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="ai" />

      <section className="aiHero">
        <div>
          <span className="eyebrow">CHATGPT PROJECT HANDOFF</span>
          <h1>Snapshots listos para analizar</h1>
          <p>
            Sports Value Lab sigue viviendo en tu Project de ChatGPT. La web organiza el trabajo,
            captura las odds y prepara el archivo; el análisis P1/P2, los modelos y sus mejoras siguen aquí.
          </p>
        </div>
        <div className="aiHeroStats">
          <div><span>Pendientes</span><strong>{queue.length}</strong></div>
          <div><span>Análisis</span><strong>ChatGPT Project</strong></div>
          <div><span>Formato</span><strong>CSV completo</strong></div>
          <div><span>Auto-registro</span><strong>No</strong></div>
        </div>
      </section>

      <section className="safetyBanner">
        <strong>Una sola fuente intelectual</strong>
        <span>
          La web no mantiene un modelo paralelo. CORE, playbooks, configs, histórico, validación,
          prompts y evolución metodológica continúan en Sports Value Lab dentro de ChatGPT/Drive.
        </span>
      </section>

      <AIWorkspaceClient queue={queue} />

      <footer>
        <p>ChatGPT Workspace · captura/exportación solamente. El análisis se ejecuta dentro del Project Sports Value Lab.</p>
      </footer>
    </main>
  );
}
