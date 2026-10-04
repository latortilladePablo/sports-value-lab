export const statusMeta = {
  ERROR: { label: "Error de scope", tone: "danger" },
  CHATGPT_REQUIRED: { label: "ChatGPT requerido", tone: "violet" },
  P1_REQUIRED: { label: "P1 requerido", tone: "danger" },
  AUTO_REQUIRED: { label: "AUTO requerido", tone: "danger" },
  CHECK_REQUIRED: { label: "CHECK requerido", tone: "warning" },
  FORCE_RECOMMENDED: { label: "FORCE recomendado", tone: "warning" },
  CONTEXT_WATCH: { label: "Esperar contexto", tone: "info" },
  OK: { label: "Sin acción", tone: "success" },
};

const priority = {
  ERROR: 0,
  CHATGPT_REQUIRED: 1,
  P1_REQUIRED: 2,
  AUTO_REQUIRED: 3,
  CHECK_REQUIRED: 4,
  FORCE_RECOMMENDED: 5,
  CONTEXT_WATCH: 6,
  OK: 7,
};

export const snapshot = {
  capturedAt: "2026-10-04 16:41 CDMX",
  source: "Google Sheets CURRENT · snapshot V1",
  portfolio: {
    bank: 185.05,
    pnl: -14.95,
    roi: -19.41,
    settledStake: 77,
    picks: 44,
    resolved: 44,
    pending: 0,
    hitRate: 42.5,
  },
  sports: [
    {
      id: "nba",
      name: "NBA",
      icon: "🏀",
      status: "ERROR",
      prompt: "NADA",
      scan: "NINGUNA",
      credits: "0",
      window: "Corregir script antes del siguiente ciclo CURRENT",
      scope: "NBA regular season · full-game",
      lastRun: "03 oct · 12:15",
      run: "NBA-P2_AUTO-20261003-121506",
      events: 3,
      newEvents: 3,
      reason:
        "SCRIPT_SCOPE_MISMATCH: el último AUTO compró odds de NBA Preseason, fuera del scope CURRENT. Ese snapshot no se usa para generar picks.",
    },
    {
      id: "nhl",
      name: "NHL",
      icon: "🏒",
      status: "CONTEXT_WATCH",
      prompt: "P2",
      scan: "NINGUNA",
      credits: "0 ahora",
      window: "Pregame 04/oct",
      scope: "NHL CURRENT",
      lastRun: "04 oct · 16:41",
      run: "NHL-P2_CHECK-20261004-164104",
      events: 3,
      newEvents: 0,
      reason:
        "CHECK completado: 0 eventos nuevos. El handoff anterior pide revisar goalie/contexto pregame; sólo usar P2 FORCE si esa información material justifica repricing.",
    },
    {
      id: "tennis",
      name: "Tennis",
      icon: "🎾",
      status: "OK",
      prompt: "NADA",
      scan: "NINGUNA",
      credits: "0",
      window: "Nuevo ciclo: domingo 18:00 / lunes temprano",
      scope: "ATP/WTA Singles CURRENT",
      lastRun: "04 oct · 16:41",
      run: "TENNIS-P2_CHECK-20261004-164124",
      events: 0,
      newEvents: 0,
      reason:
        "CHECK completado: no hay eventos Tennis futuros dentro de la ventana actual. No comprar odds.",
    },
    {
      id: "nfl",
      name: "NFL",
      icon: "🏈",
      status: "CONTEXT_WATCH",
      prompt: "P2",
      scan: "NINGUNA",
      credits: "0 ahora",
      window: "Sunday final / MNF",
      scope: "NFL full-game CURRENT",
      lastRun: "03 oct · 12:09",
      run: "NFL-P2_CHECK-20261003-120927",
      events: 15,
      newEvents: 0,
      reason:
        "Calendario conocido. La próxima captura depende de inactives, QB, injury report, clima o repricing material.",
    },
    {
      id: "soccer",
      name: "Soccer",
      icon: "⚽",
      status: "OK",
      prompt: "NADA",
      scan: "NINGUNA",
      credits: "0",
      window: "Siguiente P1: lunes",
      scope: "Ligas CURRENT · 90m",
      lastRun: "03 oct · 12:12",
      run: "SOCCER-P2_CHECK-20261003-121218",
      events: 5,
      newEvents: 0,
      reason:
        "Último CHECK sin partidos CURRENT nuevos y sin gatillo material registrado. Próximo ciclo semanal: lunes.",
    },
  ],
};

export function orderedSports() {
  return [...snapshot.sports].sort((a, b) => priority[a.status] - priority[b.status]);
}

export function primaryAction() {
  return orderedSports()[0];
}
