const SPORTS = ["nba", "nhl", "nfl", "soccer", "tennis"];
const MAX_AGE_MS = 150 * 60 * 1000;

function nextStep(sport) {
  if (!sport) return "Consultar estado CURRENT";
  if (sport.status === "CHATGPT_REQUIRED") return `Analizar CSV en ChatGPT con ${sport.prompt === "P1" ? "P1" : "P2"}`;
  if (sport.status === "AUTO_REQUIRED") return "Ejecutar P2 AUTO y después analizar CSV con P2";
  if (sport.status === "P1_REQUIRED") return "Ejecutar P1 COMPLETO y analizar CSV con P1";
  if (sport.status === "ERROR") return "Resolver bloqueo de scope antes de capturar";
  if (sport.scan === "CHECK P2") return "Ejecutar CHECK P2";
  if (sport.scan === "P2 FORCE") return "Revisar causa y confirmar gatillo antes de P2 FORCE";
  return "Revisar contexto prepartido; no capturar cuotas sólo por un titular";
}

export function normalizeNewsWatch(payload, sports = []) {
  const checked = Date.parse(payload?.checked_at_utc || "");
  const ageMs = Date.now() - checked;
  const freshness = !Number.isFinite(checked) ? "NO_CONFIGURADO"
    : ageMs < 0 || ageMs > MAX_AGE_MS ? "DESACTUALIZADO" : "ACTUALIZADO";
  const byId = Object.fromEntries(sports.map((sport) => [sport.id, sport]));
  return {
    checkedAt: Number.isFinite(checked) ? new Date(checked).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" }) + " CDMX" : "Sin comprobación",
    freshness,
    sports: SPORTS.map((id) => {
      const row = payload?.sports?.[id];
      const articles = Array.isArray(row?.articles)
        ? row.articles.filter((a) => typeof a.title === "string" && /^https:\/\//.test(a.url || "")).slice(0, 5)
        : [];
      const status = row?.status === "SOURCE_ERROR" ? "ERROR"
        : freshness !== "ACTUALIZADO" ? freshness
        : articles.length ? "TITULARES_SIN_VERIFICAR" : "SIN_SENALES_EN_FEED";
      return { id, name: byId[id]?.name || id.toUpperCase(), icon: byId[id]?.icon || "📰",
        status, articles, nextStep: nextStep(byId[id]), operationalStatus: byId[id]?.status || "DESCONOCIDO" };
    }),
  };
}

export async function getNewsWatch(sports = []) {
  // In step 4, provide the durable public JSON URL produced by the hourly workflow.
  // No placeholder data is treated as live news.
  const url = process.env.SVL_NEWS_WATCH_URL;
  if (!url || !/^https:\/\//.test(url)) return normalizeNewsWatch(null, sports);
  try {
    const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    return normalizeNewsWatch(data, sports);
  } catch {
    const value = normalizeNewsWatch(null, sports);
    return { ...value, freshness: "ERROR", sports: value.sports.map((s) => ({ ...s, status: "ERROR" })) };
  }
}
