import { NextResponse } from "next/server";
import { isAiAuthorized } from "../../../../lib/ai-auth";
import { getAiHistory } from "../../../../lib/bridge-ai";

export async function GET(request) {
  if (!(await isAiAuthorized())) {
    return NextResponse.json({ ok: false, error: "Sesión AI de propietario requerida" }, { status: 401 });
  }

  try {
    const sport = new URL(request.url).searchParams.get("sport") || "";
    const data = await getAiHistory(sport);
    return NextResponse.json({ ok: true, rows: data.rows || [] });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo leer AI_ANALYSIS_LOG",
    }, { status: 500 });
  }
}
