import AppNav from "../../components/AppNav";
import ActionCenterClient from "../../components/ActionCenterClient";
import { getDashboardData } from "../../lib/live";
import { getActionPolicy } from "../../lib/action-policy";
import OwnerGate from "../../components/OwnerGate";
import { isOwnerAuthorized, ownerSecurityConfigured } from "../../lib/owner-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ActionsPage() {
  const data = await getDashboardData({ fresh: true });
  const ownerConfigured = ownerSecurityConfigured();
  const ownerAuthorized = ownerConfigured ? await isOwnerAuthorized() : false;

  const sports = data.sports.map((sport) => {
    const runnerConfigured = !!data.runners?.[sport.name]?.configured;
    return {
      id: sport.id,
      name: sport.name,
      icon: sport.icon,
      scope: sport.scope,
      status: sport.status,
      statusLabel: data.statusMeta[sport.status]?.label || sport.status,
      scan: sport.scan,
      lastRun: sport.lastRun,
      reason: sport.reason,
      runnerConfigured,
      policy: getActionPolicy(sport, runnerConfigured),
    };
  });

  const connected = sports.filter((s) => s.runnerConfigured).length;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · Action Center</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="actions" />

      <section className="actionsHero">
        <div>
          <span className="eyebrow">SMART EXECUTION</span>
          <h1>Action Center</h1>
          <p>
            Ejecuta P1, CHECK P2, P2 AUTO y P2 FORCE usando los Apps Scripts SMART existentes.
            El motor CURRENT valida la acción antes de enviar cualquier orden.
          </p>
        </div>
        <div className="actionsHeroStats">
          <div><span>Runners</span><strong>{connected}/5</strong></div>
          <div><span>Fuente</span><strong>{data.live ? "LIVE" : "Fallback"}</strong></div>
          <div><span>CHECK P2</span><strong>0 odds credits</strong></div>
          <div><span>Paid gates</span><strong>Confirmación</strong></div>
        </div>
      </section>

      <section className="safetyBanner">
        <strong>Dos capas de seguridad</strong>
        <span>
          La web aplica el gate operativo antes del POST y el bridge sólo llama runners configurados.
          NBA bloquea compras mientras exista SCRIPT_SCOPE_MISMATCH.
        </span>
      </section>

      {!ownerAuthorized ? (
        <OwnerGate configured={ownerConfigured} />
      ) : null}

      {ownerAuthorized ? <>
      <section className="sectionHead">
        <div>
          <span className="eyebrow">5 DEPORTES</span>
          <h2>Ejecutar scan</h2>
        </div>
        <span className="source">{data.source}</span>
      </section>

      <ActionCenterClient sports={sports} />

      <section className="runnerSetupNotice">
        <div>
          <span className="eyebrow">RUNNER STATUS</span>
          <h2>{connected === 5 ? "Los cinco runners están conectados" : "Falta conectar runners SMART"}</h2>
          <p>
            La web no inventa nombres de funciones del Apps Script. Un runner aparece conectado sólo cuando el bridge central tiene su URL configurada.
          </p>
        </div>
        <strong>{connected}/5</strong>
      </section>

      </> : null}

      <footer>
        <p>Action Center V1 · PAPER_LIVE. No ejecuta una acción bloqueada por el motor CURRENT.</p>
      </footer>
    </main>
  );
}
