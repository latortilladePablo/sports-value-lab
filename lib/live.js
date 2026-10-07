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

function parseCdmxDateTime(v) {
  const m = String(v || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const iso = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:${m[6] || "00"}-06:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function parseScheduledCheckWindow(text) {
  const m = String(text || "").match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})\s*CDMX/i);
  if (!m) return null;
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "America/Mexico_City",
    year: "numeric",
  }).format(new Date());
  const date = `${year}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const startMs = Date.parse(`${date}T${String(m[3]).padStart(2, "0")}:${m[4]}:00-06:00`);
  const endMs = Date.parse(`${date}T${String(m[5]).padStart(2, "0")}:${m[6]}:00-06:00`);
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : null;
}

function formatRunTime(v) {
  if (!v) return "—";
  const m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return String(v);
  return `${String(m[3]).padStart(2, "0")}/${String(m[2]).padStart(2, "0")} · ${String(m[4]).padStart(2, "0")}:${m[5]}`;
}

function pick(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function normalizeContinuityRuns(rows) {
  return rows.map((row) => ({
    runId: String(row["Run ID"] || "—"),
    executedAt: String(row["Ejecución CDMX"] || ""),
    executedDisplay: formatRunTime(row["Ejecución CDMX"]),
    mode: String(row["Modo"] || "—"),
    cycleStart: String(row["Cycle start CDMX"] || ""),
    cutoff: String(row["NEXT_P1_CUTOFF CDMX"] || ""),
    p1Valid: String(row["P1 válido"] || "").toUpperCase() === "TRUE",
    snapshot: String(row["Snapshot/Salida"] || "—"),
    events: n(row["Eventos detectados"]),
    newEvents: n(row["Eventos nuevos"]),
    oddsRows: n(row["Filas odds"]),
    credits: n(row["Créditos"]),
    decision: String(row["Decisión"] || ""),
    analysisStatus: String(row["Estado análisis"] || ""),
    modelConfig: String(row["Modelo/config"] || ""),
    eventsEvaluated: String(row["Eventos evaluados"] || ""),
    optionsEvaluated: String(row["Opciones evaluadas"] || ""),
    picksRegistered: String(row["Picks registrados"] || ""),
    discards: String(row["Descartes relevantes"] || ""),
    nextP2: String(row["Próximo P2"] || ""),
    handoff: String(row["Notas/handoff"] || ""),
  }));
}

function normalizeApiRuns(rows) {
  return rows.map((row) => ({
    executedAt: String(pick(row, ["Ejecución CDMX"], "")),
    executedDisplay: formatRunTime(pick(row, ["Ejecución CDMX"], "")),
    mode: String(pick(row, ["Modo"], "—")),
    events: n(pick(row, ["Eventos CURRENT", "Eventos"], 0)),
    newEvents: n(pick(row, ["Nuevos CURRENT", "Eventos nuevos", "Nuevos"], 0)),
    oddsEvents: n(pick(row, ["Partidos con cuotas", "Eventos nuevos con odds"], 0)),
    oddsRows: n(pick(row, ["Filas"], 0)),
    credits: n(pick(row, ["Créditos ejecución"], 0)),
    creditsUsed: pick(row, ["Créditos usados"], ""),
    creditsRemaining: pick(row, ["Créditos restantes"], ""),
    snapshot: String(pick(row, ["Snapshot", "Salida"], "—")),
    decision: String(pick(row, ["Decisión"], "")),
    nextAction: String(pick(row, ["Próxima acción"], "")),
  }));
}

function lastNonEmpty(rows, key) {
  const hit = [...rows].reverse().find((row) => {
    const value = row?.[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  return hit ? hit[key] : "";
}

function normalizePicks(table) {
  const rows = rowsToObjects(table || []);
  return rows.map((row, index) => ({
    rowNumber: index + 6,
    createdAt: String(row["Fecha alta"] || ""),
    month: String(row["Mes alta"] || ""),
    year: String(row["Año alta"] || ""),
    startCdmx: String(row["Inicio CDMX"] || ""),
    sport: String(row["Deporte"] || ""),
    league: String(row["Liga"] || ""),
    event: String(row["Partido"] || ""),
    market: String(row["Mercado"] || ""),
    line: String(row["Línea"] || ""),
    pick: String(row["Pick"] || ""),
    source: String(row["Casa / origen"] || ""),
    odds: String(row["Cuota"] || ""),
    stake: n(row["Stake (u)"]),
    result: String(row["Resultado"] || ""),
    profit: n(row["Beneficio (u)"]),
    bank: n(row["Bank (u)"]),
    finalScore: String(row["Marcador final"] || ""),
    reviewed: String(row["Revisado ChatGPT"] || "").toUpperCase() === "TRUE",
    notes: String(row["Notas"] || ""),
  }));
}


function deriveSport(name, raw) {
  const meta = SPORT_META[name];
  const continuity = rowsToObjects(raw?.continuity || []);
  const apiRows = rowsToObjects(raw?.apiLog || []);
  const runs = normalizeContinuityRuns(continuity);
  const apiRuns = normalizeApiRuns(apiRows);
  const latest = continuity.at(-1) || {};
  const latestRun = runs.at(-1) || {};
  const latestApi = apiRuns.at(-1) || {};
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

  const lastOddsRun = [...runs].reverse().find((run) => run.oddsRows > 0) || {};
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
    scanData: {
      lastMode: latestRun.mode || "—",
      latestSnapshot: latestRun.snapshot || "—",
      latestAnalysisStatus: latestRun.analysisStatus || "—",
      latestOddsRows: lastOddsRun.oddsRows || 0,
      latestOddsSnapshot: lastOddsRun.snapshot || "—",
      latestCredits: latestApi.credits || 0,
      creditsRemaining: lastNonEmpty(apiRuns, "creditsRemaining") || "—",
      creditsRemainingLabel: "último valor registrado",
      nextReview: priorNext || latestApi.nextAction || "—",
    },
    runs,
    apiRuns,
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

  const currentAnalysisCompleted =
    snapshotMode &&
    analysisState &&
    !/PENDING|DATA_READY|SNAPSHOT_READY/i.test(analysisState);
  const nextDirective = String(priorNext || "").toUpperCase();

  const checkP2Index = nextDirective.search(/CHECK\s*P2/);
  const forceP2Index = nextDirective.search(/P2\s*FORCE/);
  const firstExplicitNext =
    checkP2Index >= 0 && (forceP2Index < 0 || checkP2Index < forceP2Index)
      ? "CHECK_P2"
      : forceP2Index >= 0
        ? "P2_FORCE"
        : "";

  if (firstExplicitNext === "CHECK_P2") {
    const scheduled = parseScheduledCheckWindow(priorNext);
    const nowMs = Date.now();
    const latestCheckMs = mode === "P2_CHECK"
      ? parseCdmxDateTime(latest["Ejecución CDMX"])
      : 0;
    const scheduledCheckAlreadyDone = scheduled && latestCheckMs >= scheduled.startMs;

    if (scheduled && nowMs < scheduled.startMs) {
      return {
        ...out,
        status: "CONTEXT_WATCH",
        scan: "NINGUNA",
        prompt: "NADA",
        credits: "0",
        reason: mode === "P2_CHECK"
          ? "CHECK P2 ejecutado antes de la ventana recomendada. No repetir ahora; esperar a la ventana indicada por el handoff."
          : "El handoff dejó CHECK P2 para una ventana futura. Esperar hasta esa ventana; no ejecutar antes.",
        window: priorNext || "Esperar ventana programada",
      };
    }

    if (scheduled && !scheduledCheckAlreadyDone) {
      return {
        ...out,
        status: "CHECK_REQUIRED",
        scan: "CHECK P2",
        prompt: "P2",
        credits: "0",
        reason: mode === "P2_CHECK"
          ? "El CHECK anterior se ejecutó antes de la ventana recomendada; corresponde un CHECK dentro de la ventana del handoff."
          : "El último análisis de ChatGPT dejó CHECK P2 como siguiente acción y la ventana ya está abierta.",
        window: priorNext || "Según handoff",
      };
    }

    if (currentAnalysisCompleted) {
      return {
        ...out,
        status: "CHECK_REQUIRED",
        scan: "CHECK P2",
        prompt: "P2",
        credits: "0",
        reason: "El último análisis de ChatGPT cerró el snapshot y dejó CHECK P2 como siguiente acción.",
        window: priorNext || "Según handoff",
      };
    }
  }

  if (currentAnalysisCompleted && firstExplicitNext === "P2_FORCE") {
    return {
      ...out,
      status: "FORCE_RECOMMENDED",
      scan: "P2 FORCE",
      prompt: "P2",
      credits: "Sí",
      reason: "El último análisis de ChatGPT cerró el snapshot y dejó P2 FORCE como siguiente acción por gatillo material.",
      window: priorNext || "Ahora",
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
    const cutoffLabel = latestRun.cutoff
      ? `CHECK hasta ${latestRun.cutoff}`
      : "Ventana/cutoff consultada";
    return {
      ...out,
      status: "OK",
      reason: `No hay eventos CURRENT listados por el proveedor dentro de la ventana/cutoff consultada. Esto no implica por sí solo que el calendario oficial completo de 7 días esté vacío. Decisión runner: ${decision}`,
      window: name === "Tennis" ? "Nuevo ciclo: domingo 18:00 / lunes temprano" : cutoffLabel,
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
  const picks = normalizePicks(payload.picks || []);
  const ordered = [...sports].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);

  return {
    live: true,
    capturedAt: payload.generatedAt || "ahora",
    source: "Google Sheets CURRENT · LIVE",
    portfolio: payload.portfolio,
    picks,
    picksLive: Array.isArray(payload.picks),
    runners: payload.runners || {},
    bridgeVersion: payload.bridgeVersion || "legacy",
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
    picks: [],
    picksLive: false,
    runners: {},
    bridgeVersion: "fallback",
    sports: fallbackSnapshot.sports,
    orderedSports: ordered,
    primary: ordered[0],
    statusMeta: STATUS_META,
  };
}

export async function getDashboardData(options = {}) {
  const url = process.env.SVL_GOOGLE_BRIDGE_URL;
  const token = process.env.SVL_BRIDGE_TOKEN;

  if (!url || !token) return fallback("Puente Google aún no configurado");

  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
      ...(options.fresh ? { cache: "no-store" } : { next: { revalidate: 20, tags: ["svl-google"] } }),
      redirect: "follow",
      headers: { "accept": "application/json,text/plain,*/*" },
    });

    if (!res.ok) return fallback(`Puente Google respondió HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();

    if (/application\/json/i.test(contentType) || body.trim().startsWith("{")) {
      const payload = JSON.parse(body);
      if (!payload?.ok) return fallback(payload?.error || "Respuesta inválida del puente Google");
      return normalizePayload(payload);
    }

    const lower = body.toLowerCase();
    if (
      lower.includes("accounts.google.com") ||
      lower.includes("sign in") ||
      lower.includes("iniciar sesión") ||
      lower.includes("google accounts")
    ) {
      return fallback("Apps Script exige iniciar sesión. Revisa que la Web app tenga acceso: Cualquier usuario / Anyone.");
    }

    if (
      lower.includes("script function not found") ||
      lower.includes("function not found") ||
      lower.includes("doGet".toLowerCase())
    ) {
      return fallback("La implementación publicada no contiene doGet. Crea una nueva versión de la Web app con el código guardado.");
    }

    if (lower.includes("authorization is required") || lower.includes("se requiere autorización")) {
      return fallback("El Apps Script publicado todavía requiere autorización de la cuenta ejecutora.");
    }

    return fallback(`Apps Script devolvió HTML en vez de JSON (content-type: ${contentType || "desconocido"}). Revisa acceso y versión de la implementación.`);
  } catch (err) {
    return fallback(err instanceof Error ? err.message : "Error consultando Google");
  }
}

export { STATUS_META };
