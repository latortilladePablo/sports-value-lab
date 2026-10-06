import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDashboardData } from "../../../../lib/live";
import { completeChatGPTAnalysis } from "../../../../lib/bridge-ai";
import { isOwnerAuthorized } from "../../../../lib/owner-auth";

export async function POST(request) {
  if (!(await isOwnerAuthorized())) {
    return NextResponse.json({ ok: false, error: "Owner session requerida" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body?.confirm) {
      return NextResponse.json({ ok: false, error: "Confirma que el Run ID ya fue analizado en ChatGPT" }, { status: 400 });
    }

    const sportId = String(body.sport || "");
    const runId = String(body.runId || "");
    const nextAction = String(body.nextAction || "");
    const note = String(body.note || "").slice(0, 1200);

    if (!sportId || !runId) {
      return NextResponse.json({ ok: false, error: "sport y runId son obligatorios" }, { status: 400 });
    }

    if (!["NINGUNA", "CHECK_P2", "P2_FORCE"].includes(nextAction)) {
      return NextResponse.json({ ok: false, error: "Siguiente acción no válida" }, { status: 400 });
    }

    const data = await getDashboardData({ fresh: true });
    if (!data.live) {
      return NextResponse.json({ ok: false, error: "CURRENT no disponible" }, { status: 503 });
    }

    const sport = data.sports.find((item) => item.id === sportId);
    if (!sport) {
      return NextResponse.json({ ok: false, error: "Deporte no válido" }, { status: 400 });
    }

    const run = (sport.runs || []).find((item) => item.runId === runId);
    if (!run) {
      return NextResponse.json({ ok: false, error: "Run ID no encontrado" }, { status: 404 });
    }

    if (!/^(P1|P2_AUTO|P2_FORCE)/.test(String(run.mode || ""))) {
      return NextResponse.json({ ok: false, error: "Ese run no es un snapshot de análisis P1/P2" }, { status: 409 });
    }

    if (!/PENDING|DATA_READY|SNAPSHOT_READY/i.test(String(run.analysisStatus || ""))) {
      return NextResponse.json({ ok: false, error: "Ese run ya no está pendiente de análisis" }, { status: 409 });
    }

    const result = await completeChatGPTAnalysis({
      sport: sport.name,
      runId,
      nextAction,
      note,
    });

    revalidateTag("svl-google", "max");
    revalidatePath("/");
    revalidatePath("/ai");
    revalidatePath("/actions");
    revalidatePath("/scans");

    return NextResponse.json({
      ok: true,
      sport: sport.name,
      runId,
      nextAction,
      result,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo cerrar el handoff de ChatGPT",
    }, { status: 500 });
  }
}
