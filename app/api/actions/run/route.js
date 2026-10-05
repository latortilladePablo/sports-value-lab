import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDashboardData } from "../../../../lib/live";
import { validateActionRequest } from "../../../../lib/action-policy";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await getDashboardData({ fresh: true });
    if (!data.live) {
      return NextResponse.json({ ok: false, error: "Fuente CURRENT no disponible" }, { status: 503 });
    }

    const sport = data.sports.find((s) => s.id === body.sport);
    if (!sport) {
      return NextResponse.json({ ok: false, error: "Deporte no válido" }, { status: 400 });
    }

    const runnerConfigured = !!data.runners?.[sport.name]?.configured;
    const gate = validateActionRequest({
      sport,
      action: body.action,
      runnerConfigured,
      confirmPaid: body.confirmPaid,
      materialTrigger: body.materialTrigger,
    });

    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const url = process.env.SVL_GOOGLE_BRIDGE_URL;
    const token = process.env.SVL_BRIDGE_TOKEN;
    if (!url || !token) {
      return NextResponse.json({ ok: false, error: "Bridge no configurado" }, { status: 503 });
    }

    const sep = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      headers: { "content-type": "application/json", "accept": "application/json,text/plain,*/*" },
      body: JSON.stringify({
        command: "scan",
        sport: sport.name,
        mode: body.action,
      }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "El bridge devolvió una respuesta no JSON" }, { status: 502 });
    }

    if (!response.ok || !payload?.ok) {
      const detail = payload?.runner?.error || payload?.error || "Runner rechazó la ejecución";
      return NextResponse.json({ ok: false, error: detail, detail: payload }, { status: 502 });
    }

    revalidateTag("svl-google", "max");
    revalidatePath("/");
    revalidatePath("/scans");
    revalidatePath("/actions");
    revalidatePath("/picks");

    return NextResponse.json({
      ok: true,
      message: `${sport.name} · ${gate.def.label} completado`,
      result: payload.runner,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Error interno del Action Center",
    }, { status: 500 });
  }
}
