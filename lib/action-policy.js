export const ACTION_DEFS = {
  P1_COMPLETO: {
    id: "P1_COMPLETO",
    label: "P1 COMPLETO",
    short: "P1",
    paid: true,
    description: "Captura el scope CURRENT completo del horizonte P1 y compra odds."
  },
  P2_CHECK: {
    id: "P2_CHECK",
    label: "CHECK P2",
    short: "CHECK",
    paid: false,
    description: "Consulta calendario/event IDs sin comprar odds."
  },
  P2_AUTO: {
    id: "P2_AUTO",
    label: "P2 AUTO",
    short: "AUTO",
    paid: true,
    description: "Compra odds sólo para eventos CURRENT nuevos detectados por CHECK."
  },
  P2_FORCE: {
    id: "P2_FORCE",
    label: "P2 FORCE",
    short: "FORCE",
    paid: true,
    description: "Repricing de eventos CURRENT conocidos con gatillo material confirmado."
  }
};

export function getActionPolicy(sport, runnerConfigured) {
  const common = {
    runnerConfigured: !!runnerConfigured,
    blockedByAnalysis: sport.status === "CHATGPT_REQUIRED",
  };

  const paidScopeBlocked = sport.status === "ERROR";
  const p1Allowed = sport.status === "P1_REQUIRED" && !common.blockedByAnalysis && !paidScopeBlocked;
  const checkAllowed =
    !common.blockedByAnalysis &&
    sport.status !== "P1_REQUIRED" &&
    sport.status !== "AUTO_REQUIRED";
  const autoAllowed =
    sport.status === "AUTO_REQUIRED" &&
    Number(sport.newEvents || 0) > 0 &&
    !paidScopeBlocked;
  const forceEligible =
    (sport.status === "FORCE_RECOMMENDED" || sport.status === "CONTEXT_WATCH") &&
    !paidScopeBlocked &&
    !common.blockedByAnalysis;

  const withRunner = (allowed, reason) => ({
    allowed: allowed && !!runnerConfigured,
    eligible: allowed,
    reason: !runnerConfigured ? "Runner SMART no configurado" : reason,
  });

  return {
    P1_COMPLETO: withRunner(
      p1Allowed,
      p1Allowed
        ? "P1 requerido por el motor CURRENT"
        : paidScopeBlocked
          ? "Bloqueado por scope/error"
          : sport.status === "CHATGPT_REQUIRED"
            ? "Analiza primero el snapshot pendiente"
            : "El motor no marca P1 requerido"
    ),
    P2_CHECK: withRunner(
      checkAllowed,
      checkAllowed
        ? "Discovery sin compra de odds"
        : sport.status === "AUTO_REQUIRED"
          ? "CHECK ya encontró eventos nuevos: corresponde AUTO"
          : sport.status === "P1_REQUIRED"
            ? "Corresponde P1, no CHECK"
            : "Analiza primero el snapshot pendiente"
    ),
    P2_AUTO: withRunner(
      autoAllowed,
      autoAllowed
        ? `${sport.newEvents} evento(s) CURRENT nuevo(s) detectado(s)`
        : paidScopeBlocked
          ? "Bloqueado por scope/error"
          : "AUTO exige CHECK previo con eventos CURRENT nuevos"
    ),
    P2_FORCE: {
      ...withRunner(
        forceEligible,
        forceEligible
          ? "Requiere confirmar un gatillo material antes de ejecutar"
          : paidScopeBlocked
            ? "Bloqueado por scope/error"
            : "FORCE exige CONTEXT_WATCH/FORCE_RECOMMENDED"
      ),
      requiresMaterialTrigger: true,
    },
  };
}

export function validateActionRequest({ sport, action, runnerConfigured, confirmPaid, materialTrigger }) {
  const def = ACTION_DEFS[action];
  if (!def) return { ok: false, status: 400, error: "Acción no válida" };

  const policy = getActionPolicy(sport, runnerConfigured);
  const item = policy[action];
  if (!item?.allowed) {
    return { ok: false, status: 409, error: item?.reason || "Acción bloqueada por el motor" };
  }

  if (def.paid && !confirmPaid) {
    return { ok: false, status: 400, error: "Confirma que esta acción puede consumir créditos de Odds API" };
  }

  if (action === "P2_FORCE" && !materialTrigger) {
    return { ok: false, status: 400, error: "P2 FORCE requiere confirmar un gatillo material" };
  }

  return { ok: true, def, policy: item };
}
