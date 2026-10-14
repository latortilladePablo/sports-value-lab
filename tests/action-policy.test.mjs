import test from "node:test";
import assert from "node:assert/strict";
import { getActionPolicy, getRecommendedAction, validateActionRequest } from "../lib/action-policy.js";

const sport = (status, newEvents = 0) => ({
  id: "nfl", name: "NFL", status, scan: "NINGUNA", newEvents,
});

test("P1 manual no exige P2 ni bandera P1_REQUIRED (reinicio tras semanas)", () => {
  for (const status of [
    "OK", "CONTEXT_WATCH", "CHECK_REQUIRED", "AUTO_REQUIRED",
    "FORCE_RECOMMENDED", "P1_REQUIRED", "CHATGPT_REQUIRED",
  ]) {
    const got = getActionPolicy(sport(status), true).P1_COMPLETO;
    assert.equal(got.allowed, true, `Debe permitir P1 en ${status}`);
  }
});

test("Un snapshot CHATGPT pendiente no se borra ni obliga a P2 antes de nuevo P1", () => {
  const state = sport("CHATGPT_REQUIRED");
  const result = validateActionRequest({
    sport: state, action: "P1_COMPLETO", runnerConfigured: true,
    confirmPaid: true, materialTrigger: false,
  });
  assert.equal(result.ok, true);
  assert.match(result.policy.reason, /se conserva/);
});

test("NBA SCRIPT_SCOPE_MISMATCH sigue bloqueando compras", () => {
  const nba = { ...sport("ERROR"), id: "nba", name: "NBA" };
  for (const action of ["P1_COMPLETO", "P2_AUTO", "P2_FORCE"]) {
    const got = validateActionRequest({
      sport: nba, action, runnerConfigured: true, confirmPaid: true, materialTrigger: true,
    });
    assert.equal(got.ok, false);
    assert.equal(got.status, 409);
  }
  assert.equal(getActionPolicy(nba, true).P2_CHECK.allowed, true);
});

test("Un runner desconectado impide P1 incluso en modo manual", () => {
  assert.equal(getActionPolicy(sport("OK"), false).P1_COMPLETO.allowed, false);
  const got = validateActionRequest({
    sport: sport("OK"), action: "P1_COMPLETO", runnerConfigured: false, confirmPaid: true,
  });
  assert.equal(got.ok, false);
  assert.match(got.error, /Runner SMART/);
});

test("P1 manual requiere confirmación explícita de créditos", () => {
  const base = { sport: sport("OK"), action: "P1_COMPLETO", runnerConfigured: true };
  assert.equal(validateActionRequest({ ...base, confirmPaid: false }).ok, false);
  assert.equal(validateActionRequest({ ...base, confirmPaid: true }).ok, true);
});

test("P2 AUTO conserva prerequisito de CHECK con eventos nuevos", () => {
  assert.equal(getActionPolicy(sport("AUTO_REQUIRED", 0), true).P2_AUTO.allowed, false);
  assert.equal(getActionPolicy(sport("AUTO_REQUIRED", 2), true).P2_AUTO.allowed, true);
  assert.equal(getActionPolicy(sport("OK", 2), true).P2_AUTO.allowed, false);
});

test("P2 FORCE sigue exigiendo gatillo material", () => {
  const state = sport("CONTEXT_WATCH");
  assert.equal(validateActionRequest({
    sport: state, action: "P2_FORCE", runnerConfigured: true, confirmPaid: true,
    materialTrigger: false,
  }).ok, false);
  assert.equal(validateActionRequest({
    sport: state, action: "P2_FORCE", runnerConfigured: true, confirmPaid: true,
    materialTrigger: true,
  }).ok, true);
});

test("CHECK P2 aún respeta el bloqueo por análisis pendiente", () => {
  assert.equal(getActionPolicy(sport("CHATGPT_REQUIRED"), true).P2_CHECK.allowed, false);
});

test("P1 manual no cambia la lógica del botón 'Ejecutar recomendada'", () => {
  assert.equal(getRecommendedAction(sport("OK")), null);
  assert.equal(getRecommendedAction(sport("CHATGPT_REQUIRED")), null);
  assert.equal(getRecommendedAction(sport("P1_REQUIRED")), "P1_COMPLETO");
});

test("Estado desconocido no evade el gate de runner y confirmación", () => {
  assert.equal(getActionPolicy(sport("OTRO"), false).P1_COMPLETO.allowed, false);
  assert.equal(getActionPolicy(sport("OTRO"), true).P1_COMPLETO.allowed, false);
  assert.equal(validateActionRequest({
    sport: sport("OTRO"), action: "P1_COMPLETO", runnerConfigured: true,
    confirmPaid: true,
  }).ok, false);
});
