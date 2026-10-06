import { NextResponse } from "next/server";
import {
  OWNER_COOKIE_NAME,
  ownerSecurityConfigured,
  ownerSessionCookieValue,
  validateOwnerToken,
} from "../../../../lib/owner-auth";

export async function POST(request) {
  if (!ownerSecurityConfigured()) {
    return NextResponse.json({ ok: false, error: "SVL_OWNER_TOKEN no configurado" }, { status: 503 });
  }

  const body = await request.json();
  if (!validateOwnerToken(body?.token)) {
    return NextResponse.json({ ok: false, error: "Token incorrecto" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OWNER_COOKIE_NAME, ownerSessionCookieValue(), {
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
  response.cookies.set(OWNER_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
