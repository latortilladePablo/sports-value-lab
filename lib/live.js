import { snapshot as fallbackSnapshot } from "./state";

const STATUS_META = {
  ERROR: { label: "Error de scope", tone: "danger" },
  CHATGPT_REQUIRED: { label: "ChatGPT requerido", tone: "violet" },
  P1_REQUIRED: { label: "P1 requerido", tone: "danger" },
  AUTO_REQUIRED: { label: "AUTO requerido", tone: "danger" },
  CHECK_REQUIRED: { label: "CHECK requerido", tone: "warning" },
  FORCE_RECOMMENDED: { label: "FORCE recomendado", tone: "warning" },
  CONTEXT_WATCH: { label: "Esperar contexto", tone: "info" },
  OK: { label: "Sin acción", tone: "success" },
};

const PRIORITY = {
  ERROR: 0,
  CHATGPT_REQUIRED: 1,
  P1_REQUIRED: 2,
  AUTO_REQUIRED: 3,
  CHECK_REQUIRED: 4,
  FORCE_RECOMMENDED: 5,
  CONTEXT_WATCH: 6,
  OK: 7,
};

const SPORT_META = {
  NBA: { id: "nba", icon: "🏀", scope: "NBA regular season · full-game" },
  NHL: { id: "nhl", icon: "🏒", scope: "NHL CURRENT" },
  NFL: { id: "nfl", icon: "🏈", scope: "NFL full-game CURRENT" },
  Tennis: { id: "tennis", icon: "🎾", scope: "ATP/WTA Singles CURRENT" },
  Soccer: { id: "soccer", icon: "⚽", scope: "Ligas CURRENT · 90m" },
};

function rowsToObjects(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const headers = table[0] || [];
  return table.slice(1).filter((r) => r.some((v) => String(v || "").trim() !== "")).map((row) => {
    const out = {};
    headers.forEach((h, i) => {
      if (h) out[h] = row[i] ?? "";
    });
    return out;
  });
}

function n(v) {
  const x = Number(String(v ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(x) ? x : 0;
}

function latestUsefulAnalysis(rows) {
  return [...rows].reverse().find((r) => {
    const state = String(r["Estado análisis"] || "").trim();
    return state && state !== "CHECK_ONLY_OR_NO_ODDS" && !state.includes("PENDING");
  });
}

function formatRunTime(v) {
  if (!v) return "—";
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return String(v);
  return `${m[3]}/${m[2]} · ${m[4]}:${m[5]}`;
}

function deriveSport(name, raw) {
  const meta = SPORT_META[name];
  const continuity = rowsToObjects(raw?.continuity || []);
  const latest = continuity.at(-1) || {};
  const analyzed = latestUsefulAnalysis(continuity) || {};
  const control = Array.isArray(raw?.control) ? raw.control : [];

  const mode = String(latest["Modo"] || "");
  const decision = String(latest["Decisión"] || "");
  const analysisState = String(latest["Estado análisis"] || "");
  const newEvents = n(latest["Eventos nuevos"]);
  const events = n(latest["Eventos detectados"]);
  const p1Valid = String(latest["P1 válido"] || "").toUpperCase() === "TRUE";
  const priorNext = String(analyzed["Próximo P2"] || "");
  const priorHandoff = String(analyzed["Notas/handoff"] || "");
  const contextText = (priorNext + " " + priorHandoff + " " + decision).toLowerCase();

  const out = {
    id: meta.id,
    name,
    icon: meta.icon,
    scope: meta.scope,
    lastRun: formatRunTime(latest["Ejecución CDMX"]),
    run: latest["Run ID"] || "—",
    events,
    newEvents,
    credits: "0",
    prompt: "NADA",
    scan: "NINGUNA",
    window: priorNext || "Según workflow CURRENT",
    status: "OK",
    reason: decision || "Universo cubierto sin acción pendiente.",
  };

  if (name === "NBA") {
    const outOfScopeBought = control.some((r) => {
      const label = String(r?.[0] || "");
      const capture = String(r?.[1] || "").toLowerCase();
      return /(preseason|summer league|play-in|playoffs|finals)/i.test(label) && /sí|si|yes/.test(capture);
    });
    if (outOfScopeBought) {
      return {
        ...out,
        status: "ERROR",
        reason: "SCRIPT_SCOPE_MISMATCH: el CONTROL habilita captura de odds para competiciones NBA fuera del scope CURRENT. No usar esos snapshots para picks.",
        window: "Corregir script antes del siguiente ciclo CURRENT",
      };
    }
  }

  const snapshotMode = /(^P1|P2_AUTO|P2_FORCE)/.test(mode);
  const pendingAnalysis = snapshotMode && (
    /PENDING|DATA_READY/.test(analysisState) ||
    (!analysisState && /DATA_READY/.test(decision))
  );
  if (pendingAnalysis) {
    return {
      ...out,
      status: "CHATGPT_REQUIRED",
      prompt: mode.startsWith("P1") ? "P1" : "P2",
      reason: "Hay un snapshot de odds capturado que todavía requiere análisis en ChatGPT.",
      window: "Ahora",
    };
  }

  if (!p1Valid && events > 0) {
    return {
      ...out,
      status: "P1_REQUIRED",
      scan: "P1 COMPLETO",
      prompt: "P1",
      credits: "Sí",
      reason: "No hay P1 válido en el ciclo y existen eventos CURRENT evaluables.",
      window: "Ahora",
    };
  }

  if (mode === "P2_CHECK" && newEvents > 0) {
    return {
      ...out,
      status: "AUTO_REQUIRED",
      scan: "P2 AUTO",
      prompt: "P2",
      credits: "Sí",
      reason: `El último CHECK detectó ${newEvents} evento(s) CURRENT nuevo(s); corresponde capturar sus odds.`,
      window: "Ahora",
    };
  }

  if (/SIN_EVENTOS/.test(decision)) {
    return {
      ...out,
      status: "OK",
      reason: decision,
      window: name === "Tennis" ? "Nuevo ciclo: domingo 18:00 / lunes temprano" : "Sin eventos CURRENT en ventana",
    };
  }

  if (mode === "P2_CHECK" && newEvents === 0) {
    if (/force|goalie|context|inactiv|qb|injur|weather|clima|lineup|scratch|repric|movimiento material|pregame/.test(contextText)) {
      return {
        ...out,
        status: "CONTEXT_WATCH",
        prompt: "P2",
        reason: "CHECK sin eventos nuevos. Esperar el gatillo material indicado por el último handoff; P2 FORCE sólo si ese contexto exige repricing.",
        window: priorNext || "Esperar gatillo material",
      };
    }
    return {
      ...out,
      status: "OK",
      reason: decision || "CHECK completado sin eventos CURRENT nuevos.",
    };
  }

  return out;
}

function normalizePayload(payload) {
  const sports = ["NBA", "NHL", "NFL", "Tennis", "Soccer"].map((name) =>
    deriveSport(name, payload.sports?.[name] || {})
  );

  const ordered = [...sports].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);

  return {
    live: true,
    capturedAt: payload.generatedAt || "ahora",
    source: "Google Sheets CURRENT · LIVE",
    portfolio: payload.portfolio,
    sports,
    orderedSports: ordered,
    primary: ordered[0],
    statusMeta: STATUS_META,
  };
}

function fallback(reason) {
  const ordered = [...fallbackSnapshot.sports].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
  return {
    live: false,
    fallbackReason: reason,
    capturedAt: fallbackSnapshot.capturedAt,
    source: "Snapshot CURRENT · fallback",
    portfolio: fallbackSnapshot.portfolio,
    sports: fallbackSnapshot.sports,
    orderedSports: ordered,
    primary: ordered[0],
    statusMeta: STATUS_META,
  };
}

export async function getDashboardData() {
  const url = process.env.SVL_GOOGLE_BRIDGE_URL;
  const token = process.env.SVL_BRIDGE_TOKEN;

  if (!url || !token) return fallback("Puente Google aún no configurado");

  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { "accept": "application/json" },
    });

    if (!res.ok) return fallback(`Puente Google respondió HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload?.ok) return fallback(payload?.error || "Respuesta inválida del puente Google");
    return normalizePayload(payload);
  } catch (err) {
    return fallback(err instanceof Error ? err.message : "Error consultando Google");
  }
}

export { STATUS_META };
