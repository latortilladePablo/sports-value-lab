import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "svl_owner";

function sessionValue() {
  const secret = process.env.SVL_OWNER_TOKEN;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("sports-value-lab-owner-session").digest("base64url");
}

export function ownerSecurityConfigured() {
  return !!process.env.SVL_OWNER_TOKEN;
}

export async function isOwnerAuthorized() {
  const expected = sessionValue();
  if (!expected) return false;
  const store = await cookies();
  const actual = store.get(COOKIE)?.value || "";
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function validateOwnerToken(token) {
  const expected = process.env.SVL_OWNER_TOKEN || "";
  const supplied = String(token || "");
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function ownerSessionCookieValue() {
  return sessionValue();
}

export { COOKIE as OWNER_COOKIE_NAME };
