import Link from "next/link";
import AppNav from "../../components/AppNav";
import { getDashboardData } from "../../lib/live";

export const revalidate = 20;

const VALID_RESULTS = ["Ganada","Perdida","Nula","Media ganada","Media perdida"];

function resultTone(result) {
  if (result === "Ganada" || result === "Media ganada") return "win";
  if (result === "Perdida" || result === "Media perdida") return "loss";
  if (result === "Nula") return "void";
  return "pending";
}

function marketLabel(pick) {
  const bits = [pick.market, pick.line, pick.pick].filter(Boolean);
  return bits.join(" · ");
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
}

function FilterBar({ picks, filters }) {
  const sports = uniq(picks.map((p) => p.sport));
  const markets = uniq(picks.map((p) => p.market));
  const results = uniq(picks.map((p) => p.result));
  const months = uniq(picks.map((p) => p.month));
  const books = uniq(picks.map((p) => p.source));

  return (
    <form className="pickFilters" method="get">
      <input type="hidden" name="tab" value="historico" />
      <select name="sport" defaultValue={filters.sport}>
        <option value="">Todos los deportes</option>
        {sports.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select name="market" defaultValue={filters.market}>
        <option value="">Todos los mercados</option>
        {markets.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select name="result" defaultValue={filters.result}>
        <option value="">Todos los resultados</option>
        {results.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select name="month" defaultValue={filters.month}>
        <option value="">Todos los meses</option>
        {months.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select name="book" defaultValue={filters.book}>
        <option value="">Todas las casas</option>
        {books.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <input name="q" defaultValue={filters.q} placeholder="Partido, liga o pick…" />
      <button type="submit">Filtrar</button>
      <Link href="/picks?tab=historico">Limpiar</Link>
    </form>
  );
}

function PickCard({ pick, active = false }) {
  return (
    <article className="pickCard">
      <div className="pickCardTop">
        <div>
          <span className="pickSport">{pick.sport} · {pick.league}</span>
          <h3>{pick.event}</h3>
          <p>{pick.startCdmx} CDMX</p>
        </div>
        <span className={"resultPill " + resultTone(pick.result)}>{pick.result || "Pendiente"}</span>
      </div>

      <div className="pickSelection">
        <span>{marketLabel(pick)}</span>
        <strong>@{pick.odds || "—"}</strong>
      </div>

      <div className="pickNumbers">
        <div><span>Origen</span><b>{pick.source || "—"}</b></div>
        <div><span>Stake</span><b>{pick.stake.toFixed(0)}u</b></div>
        <div><span>{active ? "Riesgo" : "Beneficio"}</span><b>{active ? "-" + pick.stake.toFixed(0) + "u" : (pick.profit >= 0 ? "+" : "") + pick.profit.toFixed(2) + "u"}</b></div>
        <div><span>Bank</span><b>{pick.bank ? pick.bank.toFixed(2) + "u" : "—"}</b></div>
      </div>

      {!active && pick.finalScore ? (
        <div className="pickScore"><span>Marcador final</span><b>{pick.finalScore}</b></div>
      ) : null}

      {pick.notes ? (
        <details className="pickNotes">
          <summary>Notas</summary>
          <p>{pick.notes}</p>
        </details>
      ) : null}

      <div className="pickMeta">
        <span>Fila {pick.rowNumber}</span>
        <span>{pick.reviewed ? "✓ Revisado ChatGPT" : "No revisado"}</span>
      </div>
    </article>
  );
}

export default async function PicksPage({ searchParams }) {
  const query = await searchParams;
  const tab = ["activos","historico","candidatos"].includes(query?.tab) ? query.tab : "activos";
  const data = await getDashboardData();
  const picks = data.picks || [];

  const active = picks.filter((p) => p.result === "Pendiente");
  const history = picks.filter((p) => VALID_RESULTS.includes(p.result));

  const filters = {
    sport: String(query?.sport || ""),
    market: String(query?.market || ""),
    result: String(query?.result || ""),
    month: String(query?.month || ""),
    book: String(query?.book || ""),
    q: String(query?.q || "").trim(),
  };

  const filteredHistory = history.filter((p) => {
    if (filters.sport && p.sport !== filters.sport) return false;
    if (filters.market && p.market !== filters.market) return false;
    if (filters.result && p.result !== filters.result) return false;
    if (filters.month && p.month !== filters.month) return false;
    if (filters.book && p.source !== filters.book) return false;
    if (filters.q) {
      const hay = [p.event,p.league,p.pick,p.market,p.source].join(" ").toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  }).reverse();

  const openExposure = active.reduce((sum,p)=>sum+p.stake,0);
  const settledPnl = history.reduce((sum,p)=>sum+p.profit,0);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · Picks</span>
          </div>
        </div>
        <span className={"sync " + (data.live ? "liveSync" : "")}>
          ● {data.live ? "LIVE" : "Fallback"} · {data.capturedAt}
        </span>
      </header>

      <AppNav active="picks" />

      <section className="picksHero">
        <div>
          <span className="eyebrow">REGISTRO CURRENT</span>
          <h1>Picks</h1>
          <p>Lectura de la pestaña Picks del registro operativo. La web no modifica resultados, cuotas, stakes ni fórmulas.</p>
        </div>
        <div className="picksHeroStats">
          <div><span>Activos</span><strong>{active.length}</strong></div>
          <div><span>Exposición abierta</span><strong>{openExposure.toFixed(0)}u</strong></div>
          <div><span>Histórico</span><strong>{history.length}</strong></div>
          <div><span>P&L histórico</span><strong>{settledPnl >= 0 ? "+" : ""}{settledPnl.toFixed(2)}u</strong></div>
        </div>
      </section>

      {!data.picksLive ? (
        <section className="bridgeNotice">
          <strong>Registro live aún no expuesto por el puente Google.</strong>
          <span>La pantalla está lista, pero el Apps Script publicado necesita la versión que incluye Picks A:S.</span>
        </section>
      ) : null}

      <div className="pickTabs">
        <Link className={tab === "activos" ? "active" : ""} href="/picks?tab=activos">Activos <b>{active.length}</b></Link>
        <Link className={tab === "historico" ? "active" : ""} href="/picks?tab=historico">Histórico <b>{history.length}</b></Link>
        <Link className={tab === "candidatos" ? "active" : ""} href="/picks?tab=candidatos">Candidatos</Link>
      </div>

      {tab === "activos" ? (
        <section>
          <div className="sectionHead">
            <div><span className="eyebrow">RESULTADO = PENDIENTE</span><h2>Posiciones activas</h2></div>
            <span className="source">{data.picksLive ? "Registro_CURRENT · LIVE" : "Esperando puente"}</span>
          </div>
          {active.length ? (
            <div className="pickList">{[...active].reverse().map((p)=><PickCard key={p.rowNumber} pick={p} active />)}</div>
          ) : (
            <div className="emptyState largeEmpty">
              <strong>No hay picks pendientes.</strong>
              <span>Cuando Registro_CURRENT tenga una fila con Resultado = Pendiente aparecerá aquí automáticamente.</span>
            </div>
          )}
        </section>
      ) : null}

      {tab === "historico" ? (
        <section>
          <div className="sectionHead">
            <div><span className="eyebrow">RESULTADOS LIQUIDADOS</span><h2>Histórico</h2></div>
            <span className="source">{filteredHistory.length} de {history.length} picks</span>
          </div>
          <FilterBar picks={history} filters={filters} />
          {filteredHistory.length ? (
            <div className="pickList">{filteredHistory.map((p)=><PickCard key={p.rowNumber} pick={p} />)}</div>
          ) : (
            <div className="emptyState largeEmpty"><strong>Sin resultados con estos filtros.</strong></div>
          )}
        </section>
      ) : null}

      {tab === "candidatos" ? (
        <section>
          <div className="sectionHead">
            <div><span className="eyebrow">FUENTE FUTURA</span><h2>Candidatos</h2></div>
            <span className="source">No inventar datos</span>
          </div>
          <div className="candidateEmpty">
            <div className="candidateIcon">◇</div>
            <h3>Fuente estructurada aún no creada</h3>
            <p>
              Los Sheets CURRENT no contienen una tabla canónica de candidatos/rechazos. Por eso esta pestaña no reconstruye
              candidatos desde notas ni infiere probabilidades, EV o stakes.
            </p>
            <div className="candidateSchema">
              <span>Preparado para:</span>
              <code>Sports_Value_Lab_Web_CURRENT / Candidates</code>
              <small>candidate_id · run_id · inicio_cdmx · deporte · partido · mercado · línea · selección · cuota · p · EV · stake · estado · razón · objeción</small>
            </div>
          </div>
        </section>
      ) : null}

      <footer>
        <p>Picks V1 · Registro_CURRENT sigue siendo la única fuente operativa. Esta vista es de sólo lectura.</p>
      </footer>
    </main>
  );
}
