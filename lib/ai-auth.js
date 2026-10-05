import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "svl_ai_owner";

function expectedCookieValue() {
  const secret = process.env.SVL_AI_ACCESS_TOKEN;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("svl-ai-owner-session").digest("base64url");
}

export function aiSecurityConfigured() {
  return !!process.env.SVL_AI_ACCESS_TOKEN;
}

export async function isAiAuthorized() {
  const expected = expectedCookieValue();
  if (!expected) return false;
  const store = await cookies();
  const actual = store.get(COOKIE)?.value || "";
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function validateAiAccessToken(token) {
  const expected = process.env.SVL_AI_ACCESS_TOKEN || "";
  const supplied = String(token || "");
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function aiSessionCookieValue() {
  return expectedCookieValue();
}

export { COOKIE as AI_COOKIE_NAME };
