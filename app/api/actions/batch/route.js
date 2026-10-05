import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDashboardData } from "../../../../lib/live";
import { getRecommendedAction, validateActionRequest } from "../../../../lib/action-policy";

export const maxDuration = 60;

async function dispatchSport({ sport, action }) {
  const url = process.env.SVL_GOOGLE_BRIDGE_URL;
  const token = process.env.SVL_BRIDGE_TOKEN;
  if (!url || !token) {
    return { sport: sport.id, name: sport.name, ok: false, status: "error", error: "Bridge no configurado" };
  }

  const sep = url.includes("?") ? "&" : "?";
  try {
    const response = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      headers: { "content-type": "application/json", "accept": "application/json,text/plain,*/*" },
      body: JSON.stringify({
        command: "scan",
        sport: sport.name,
        mode: action,
      }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        sport: sport.id,
        name: sport.name,
        ok: false,
        status: "error",
        error: "El bridge devolvió una respuesta no JSON",
      };
    }

    if (!response.ok || !payload?.ok) {
      return {
        sport: sport.id,
        name: sport.name,
        ok: false,
        status: "error",
        error: payload?.runner?.error || payload?.error || "Runner rechazó la ejecución",
      };
    }

    return {
      sport: sport.id,
      name: sport.name,
      ok: true,
      status: "completed",
      message: `${sport.name} · ${action} completado`,
      actualAction: action,
      result: payload.runner,
    };
  } catch (err) {
    return {
      sport: sport.id,
      name: sport.name,
      ok: false,
      status: "error",
      error: err instanceof Error ? err.message : "Error llamando al runner",
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const selectedIds = [...new Set(Array.isArray(body.sports) ? body.sports : [])].slice(0, 5);

    if (!selectedIds.length) {
      return NextResponse.json({ ok: false, error: "Selecciona al menos un deporte" }, { status: 400 });
    }

    const data = await getDashboardData({ fresh: true });
    if (!data.live) {
      return NextResponse.json({ ok: false, error: "Fuente CURRENT no disponible" }, { status: 503 });
    }

    const selectedSports = selectedIds
      .map((id) => data.sports.find((sport) => sport.id === id))
      .filter(Boolean);

    if (!selectedSports.length) {
      return NextResponse.json({ ok: false, error: "No hay deportes válidos seleccionados" }, { status: 400 });
    }

    const blocked = [];
    const runnable = [];

    for (const sport of selectedSports) {
      const runnerConfigured = !!data.runners?.[sport.name]?.configured;
      const resolvedAction = body.action === "RECOMMENDED"
        ? getRecommendedAction(sport)
        : body.action;

      if (!resolvedAction) {
        blocked.push({
          sport: sport.id,
          name: sport.name,
          ok: false,
          status: "no_action",
          error: "NINGUNA: el motor CURRENT no recomienda captura",
          actualAction: null,
        });
        continue;
      }

      const gate = validateActionRequest({
        sport,
        action: resolvedAction,
        runnerConfigured,
        confirmPaid: body.confirmPaid,
        materialTrigger: body.materialTrigger,
      });

      if (!gate.ok) {
        blocked.push({
          sport: sport.id,
          name: sport.name,
          ok: false,
          status: "blocked",
          error: gate.error,
          actualAction: resolvedAction,
        });
      } else {
        runnable.push({ sport, action: resolvedAction, def: gate.def });
      }
    }

    if (!runnable.length) {
      return NextResponse.json({
        ok: false,
        error: "Ningún deporte seleccionado es elegible para esa acción",
        results: blocked,
      }, { status: 409 });
    }

    const executed = await Promise.all(
      runnable.map(({ sport, action }) => dispatchSport({ sport, action }))
    );

    revalidateTag("svl-google", "max");
    revalidatePath("/");
    revalidatePath("/scans");
    revalidatePath("/actions");
    revalidatePath("/picks");

    const results = [...executed, ...blocked];
    const succeeded = executed.filter((item) => item.ok).length;
    const failed = executed.filter((item) => !item.ok).length;

    return NextResponse.json({
      ok: succeeded > 0,
      partial: blocked.length > 0 || failed > 0,
      action: body.action,
      requested: selectedSports.length,
      executed: executed.length,
      succeeded,
      blocked: blocked.length,
      failed,
      message: `${succeeded} completado(s) · ${blocked.length} omitido/bloqueado(s) · ${failed} error(es)`,
      results,
    }, { status: succeeded > 0 ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Error interno del Action Center",
    }, { status: 500 });
  }
}
