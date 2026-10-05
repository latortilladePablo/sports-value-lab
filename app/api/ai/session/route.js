import { NextResponse } from "next/server";
import {
  AI_COOKIE_NAME,
  aiSecurityConfigured,
  aiSessionCookieValue,
  validateAiAccessToken,
} from "../../../../lib/ai-auth";

export async function POST(request) {
  if (!aiSecurityConfigured()) {
    return NextResponse.json({ ok: false, error: "SVL_AI_ACCESS_TOKEN no configurado" }, { status: 503 });
  }

  const body = await request.json();
  if (!validateAiAccessToken(body?.token)) {
    return NextResponse.json({ ok: false, error: "Acceso no autorizado" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AI_COOKIE_NAME, aiSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AI_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
