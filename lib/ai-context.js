export const SPORT_AI_CONTEXT = {
  NBA: {
    playbook: "Sports_Value_Lab_Playbook_NBA_v1.2",
    config: "NBA_CURRENT_Config_READABLE",
    scope: "NBA regular season, full-game only",
    markets: "h2h, spreads, totals",
    model: "NBA Model v1 H2H SHADOW; Margin v2.3 RESEARCH; Total v2.3 RESEARCH",
    warning: "Preseason, Summer League, Play-In, playoffs, Finals and non-regular-season Cup Championship are OUT."
  },
  NHL: {
    playbook: "Sports_Value_Lab_Playbook_NHL_v1.2",
    config: "NHL_CURRENT_Config_READABLE",
    scope: "NHL CURRENT full-game",
    markets: "h2h, supported puck lines/spreads, totals",
    model: "NHL v2 components under CURRENT registry; PAPER_LIVE research/shadow only"
  },
  NFL: {
    playbook: "Sports_Value_Lab_Playbook_NFL_v1.1",
    config: "NFL_CURRENT_Config_READABLE",
    scope: "NFL full-game CURRENT",
    markets: "2-way h2h, spreads/alternate spreads where supported, totals/alternate totals where supported",
    model: "NFL Model v2 effective selection; h2h/spreads SHADOW, totals RESEARCH"
  },
  Soccer: {
    playbook: "Sports_Value_Lab_Playbook_Soccer_v1.2",
    config: "Soccer_CURRENT_Config_READABLE",
    scope: "CURRENT leagues, 90-minute settlement",
    markets: "1X2, Asian Handicap, totals",
    model: "Soccer Model v1.0 SHADOW + CURRENT market/risk layers"
  },
  Tennis: {
    playbook: "Sports_Value_Lab_Playbook_Tennis_v1.3",
    config: "Tennis_CURRENT_Config_READABLE",
    scope: "ATP/WTA Singles CURRENT",
    markets: "Only market families CURRENT-authorized by playbook/registry; preserve retirement/void settlement distinctions",
    model: "Tennis Model v1 components with ATP/WTA status per CURRENT registry"
  }
};

export function buildAnalysisInstructions(sportName, mode) {
  const s = SPORT_AI_CONTEXT[sportName];
  return [
    "SPORTS VALUE LAB — PAPER_LIVE only. Never frame output as a real-money betting instruction or promise profit.",
    "Apply CORE v3.0 precedence: CORE > current playbook > current registry/model/config > weekly prompt.",
    "Everything must be pregame. Never use post-start information to justify an earlier decision.",
    "Odds are price/contrast, not the sole prediction source. Never invent probabilities, model outputs, injuries, availability, odds, results, local sportsbook access or calibration.",
    "Evaluate all distinct authorized lines and both sides present in the supplied snapshot. Deduplicate only exact duplicate quotes.",
    "EV central >=1% is only a research filter. A clearly adverse prudent probability versus break-even means review/discard.",
    "Stake is integer 1-10u and depends on model maturity, evidence, calibration, uncertainty, correlation and prudent EV. 7-10u requires exceptional calibrated OOS evidence.",
    "If model features or data required to defend p_central/p_prudente are absent from the supplied context, state that the probability is not defensible and do not manufacture an edge.",
    "The visible answer should be compact: coverage counts, definitive picks if any, material alerts/discards, and next P2/capture action.",
    "Do not write to the register. This AI Workspace stage is analysis-only until a later approval/registration step.",
    "",
    "CURRENT SPORT CONTEXT:",
    `Sport: ${sportName}`,
    `Mode: ${mode}`,
    `Playbook: ${s?.playbook || "CURRENT"}`,
    `Config: ${s?.config || "CURRENT"}`,
    `Scope: ${s?.scope || "CURRENT"}`,
    `Markets: ${s?.markets || "CURRENT"}`,
    `Model status: ${s?.model || "CURRENT"}`,
    s?.warning ? `Scope warning: ${s.warning}` : "",
    "",
    "Required final sections:",
    "COBERTURA",
    "PICKS DEFINITIVOS",
    "ALERTAS / DESCARTES IMPORTANTES",
    "PRÓXIMA REVISIÓN P2",
    "ACCIÓN DE CAPTURA: NINGUNA | CHECK P2 | P2 AUTO | P2 FORCE"
  ].filter(Boolean).join("\n");
}

export function snapshotToText(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  return rows.map((row) => row.map((v) => String(v ?? "").replace(/\t/g, " ")).join("\t")).join("\n");
}
