import AppNav from "../../components/AppNav";
import AIWorkspaceClient from "../../components/AIWorkspaceClient";
import { getDashboardData } from "../../lib/live";
import { aiSecurityConfigured, isAiAuthorized } from "../../lib/ai-auth";
import { openAIConfigured, openAIModel } from "../../lib/openai";

export const revalidate = 20;

export default async function AIPage() {
  const data = await getDashboardData();
  const securityConfigured = aiSecurityConfigured();
  const aiConfigured = openAIConfigured();
  const authorized = securityConfigured ? await isAiAuthorized() : false;

  const queue = data.sports.flatMap((sport) =>
    sport.runs
      .filter((run) => /PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || ""))
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
            <span>PAPER_LIVE · AI Workspace</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="ai" />

      <section className="aiHero">
        <div>
          <span className="eyebrow">STEP 9 · AI WORKSPACE</span>
          <h1>Snapshot → análisis → revisión</h1>
          <p>
            Analiza snapshots P1/P2 desde la web usando OpenAI Responses + Conversations.
            La primera versión es deliberadamente review-first: no registra picks ni cambia CONTINUITY automáticamente.
          </p>
        </div>
        <div className="aiHeroStats">
          <div><span>Pendientes</span><strong>{queue.length}</strong></div>
          <div><span>OpenAI</span><strong>{aiConfigured ? "Configurado" : "Pendiente"}</strong></div>
          <div><span>Owner gate</span><strong>{securityConfigured ? "Configurado" : "Pendiente"}</strong></div>
          <div><span>Modelo</span><strong>{openAIModel()}</strong></div>
        </div>
      </section>

      <section className="safetyBanner">
        <strong>Review-first</strong>
        <span>
          La IA puede analizar y guardar su salida, pero no escribe picks, no altera stakes/cuotas y no cierra un handoff por sí sola.
          Un deporte en ERROR/scope mismatch queda bloqueado.
        </span>
      </section>

      <AIWorkspaceClient
        queue={queue}
        authorized={authorized}
        securityConfigured={securityConfigured}
        openaiConfigured={aiConfigured}
        model={openAIModel()}
      />

      <footer>
        <p>AI Workspace V1 · Responses API + Conversations API · PAPER_LIVE.</p>
      </footer>
    </main>
  );
}
