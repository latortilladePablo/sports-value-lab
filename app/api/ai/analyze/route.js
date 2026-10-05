import { NextResponse } from "next/server";
import { isAiAuthorized } from "../../../../lib/ai-auth";
import { getDashboardData } from "../../../../lib/live";
import { getAnalysisSnapshot, appendAiLog } from "../../../../lib/bridge-ai";
import { buildAnalysisInstructions, snapshotToText } from "../../../../lib/ai-context";
import { createConversation, createAnalysisResponse, openAIConfigured } from "../../../../lib/openai";

export const maxDuration = 300;

export async function POST(request) {
  if (!(await isAiAuthorized())) {
    return NextResponse.json({ ok: false, error: "Sesión AI de propietario requerida" }, { status: 401 });
  }
  if (!openAIConfigured()) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY no configurada" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const sportId = String(body?.sport || "");
    const runId = String(body?.runId || "");
    if (!sportId || !runId) {
      return NextResponse.json({ ok: false, error: "sport y runId son obligatorios" }, { status: 400 });
    }

    const data = await getDashboardData({ fresh: true });
    if (!data.live) {
      return NextResponse.json({ ok: false, error: "CURRENT no disponible" }, { status: 503 });
    }

    const sport = data.sports.find((item) => item.id === sportId);
    if (!sport) {
      return NextResponse.json({ ok: false, error: "Deporte no válido" }, { status: 400 });
    }
    if (sport.status === "ERROR") {
      return NextResponse.json({
        ok: false,
        error: `${sport.name} está bloqueado por error/scope CURRENT: ${sport.reason}`,
      }, { status: 409 });
    }

    const run = sport.runs.find((item) => item.runId === runId);
    if (!run) {
      return NextResponse.json({ ok: false, error: "Run no encontrado en CONTINUITY" }, { status: 404 });
    }
    if (!/PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || "")) {
      return NextResponse.json({ ok: false, error: "Ese run no está pendiente de análisis" }, { status: 409 });
    }

    const snapshot = await getAnalysisSnapshot(sport.name, runId);
    const snapshotText = snapshotToText(snapshot);
    if (!snapshotText.trim()) {
      return NextResponse.json({ ok: false, error: "Snapshot vacío" }, { status: 409 });
    }

    const conversation = await createConversation({
      svl_sport: sport.name,
      svl_run_id: runId.slice(0, 64),
      svl_mode: String(snapshot.mode || run.mode || "").slice(0, 64),
    });

    const input = [
      "Analiza este snapshot CURRENT de Sports Value Lab.",
      `Run ID: ${runId}`,
      `Sport: ${sport.name}`,
      `Mode: ${snapshot.mode || run.mode}`,
      `Snapshot: ${snapshot.snapshot}`,
      `Current status: ${sport.status}`,
      `Current reason: ${sport.reason}`,
      "",
      "SNAPSHOT TSV:",
      snapshotText,
    ].join("\n");

    const result = await createAnalysisResponse({
      conversationId: conversation.id,
      instructions: buildAnalysisInstructions(sport.name, snapshot.mode || run.mode),
      input,
    });

    try {
      await appendAiLog({
        sport: sport.name,
        runId,
        mode: snapshot.mode || run.mode,
        snapshot: snapshot.snapshot,
        conversationId: conversation.id,
        responseId: result.id,
        model: result.model,
        status: "COMPLETED_REVIEW_REQUIRED",
        output: result.text,
      });
    } catch (logError) {
      // Analysis result remains valid even if bridge logging is temporarily unavailable.
    }

    return NextResponse.json({
      ok: true,
      sport: sport.name,
      runId,
      snapshot: snapshot.snapshot,
      conversationId: conversation.id,
      responseId: result.id,
      model: result.model,
      output: result.text,
      usage: result.usage,
      reviewRequired: true,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Error ejecutando análisis AI",
    }, { status: 500 });
  }
}
