import { NextResponse } from "next/server";
import { getDashboardData } from "../../../../lib/live";
import { getAnalysisSnapshot } from "../../../../lib/bridge-ai";

export const maxDuration = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSnapshotWithRetry(sport, runId) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await getAnalysisSnapshot(sport, runId);
    const rows = Array.isArray(last?.rows) ? last.rows : [];
    if (rows.length) return last;
    if (attempt < 2) await sleep(900 * (attempt + 1));
  }
  return last;
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function safePart(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "snapshot";
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const sportId = String(url.searchParams.get("sport") || "");
    const runId = String(url.searchParams.get("runId") || "");

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
        error: `Export bloqueado por scope/error CURRENT: ${sport.reason}`,
      }, { status: 409 });
    }

    const run = sport.runs.find((item) => item.runId === runId);
    if (!run) {
      return NextResponse.json({ ok: false, error: "Run no encontrado" }, { status: 404 });
    }

    if (!/^(P1|P2_AUTO|P2_FORCE)/.test(String(run.mode || ""))) {
      return NextResponse.json({ ok: false, error: "Sólo se exportan snapshots P1/P2 de odds" }, { status: 409 });
    }

    if (!/PENDING|DATA_READY|SNAPSHOT_READY/i.test(run.analysisStatus || "")) {
      return NextResponse.json({ ok: false, error: "Ese run no está pendiente de análisis" }, { status: 409 });
    }

    const snapshot = await getSnapshotWithRetry(sport.name, runId);
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "Snapshot vacío" }, { status: 409 });
    }

    const filename = [
      safePart(sport.name),
      safePart(snapshot.mode || run.mode),
      safePart(snapshot.snapshot || run.snapshot),
      safePart(runId),
    ].join("_") + ".csv";

    return new Response(toCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo exportar el snapshot";
    if (message === "snapshot_too_large") {
      return NextResponse.json({
        ok: false,
        error: "Este snapshot supera el límite del bridge publicado. Actualiza el bridge de exportación y vuelve a intentar.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
