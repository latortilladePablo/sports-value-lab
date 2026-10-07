import AppNav from "../../components/AppNav";
import AIWorkspaceClient from "../../components/AIWorkspaceClient";
import { getDashboardData } from "../../lib/live";
import { isOwnerAuthorized, ownerSecurityConfigured } from "../../lib/owner-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function bridgeSupportsHandoff(version) {
  const m = String(version || "").match(/^v(\d+)\.(\d+)/i);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 1 || (major === 1 && minor >= 2);
}

function runTimeValue(value) {
  const m = String(value || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return 0;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  );
}

export default async function ChatGPTWorkspacePage() {
  const data = await getDashboardData({ fresh: true });
  const ownerConfigured = ownerSecurityConfigured();
  const ownerAuthorized = ownerConfigured ? await isOwnerAuthorized() : false;

  const snapshots = data.sports.flatMap((sport) =>
    (sport.runs || [])
      .filter((run) =>
        /^(P1|P2_AUTO|P2_FORCE)/.test(String(run.mode || "")) &&
        Number(run.oddsRows || 0) > 0
      )
      .map((run) => ({
        sportId: sport.id,
        sport: sport.name,
        mode: run.mode,
        runId: run.runId,
        snapshot: run.snapshot,
        analysisStatus: run.analysisStatus,
        executed: run.executedDisplay,
        executedAt: run.executedAt,
        events: run.events,
        oddsRows: run.oddsRows,
        credits: run.credits,
        modelConfig: run.modelConfig,
        eventsEvaluated: run.eventsEvaluated,
        optionsEvaluated: run.optionsEvaluated,
        picksRegistered: run.picksRegistered,
        nextP2: run.nextP2,
        handoff: run.handoff,
        blocked: sport.status === "ERROR",
        blockReason: sport.status === "ERROR" ? sport.reason : "",
      }))
  ).sort((a, b) => runTimeValue(b.executedAt) - runTimeValue(a.executedAt));

  const queue = snapshots.filter((run) =>
    /PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || "")
  );

  const history = snapshots.filter((run) =>
    !/PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || "")
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
          <div><span>Bridge</span><strong>{data.bridgeVersion}</strong></div>
        </div>
      </section>

      <section className="safetyBanner">
        <strong>Una sola fuente intelectual</strong>
        <span>
          La web no mantiene un modelo paralelo. CORE, playbooks, configs, histórico, validación,
          prompts y evolución metodológica continúan en Sports Value Lab dentro de ChatGPT/Drive.
        </span>
      </section>

      <AIWorkspaceClient
        queue={queue}
        history={history}
        handoffEnabled={bridgeSupportsHandoff(data.bridgeVersion) && ownerAuthorized}
      />

      <footer>
        <p>ChatGPT Workspace · captura/exportación solamente. El análisis se ejecuta dentro del Project Sports Value Lab.</p>
      </footer>
    </main>
  );
}
