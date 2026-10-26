import crypto from "node:crypto";
import { cookies } from "next/headers";
import { verifyOwnerPassword } from "./owner-password";

const COOKIE = "svl_owner";

function sessionValue() {
  const secret = process.env.SVL_OWNER_TOKEN;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("sports-value-lab-owner-session").digest("base64url");
}

export function ownerSecurityConfigured() {
  return !!process.env.SVL_OWNER_TOKEN && !!process.env.SVL_OWNER_PASSWORD_SCRYPT;
}

export async function isOwnerAuthorized() {
  const expected = sessionValue();
  if (!expected) return false;
  const store = await cookies();
  const actual = store.get(COOKIE)?.value || "";
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function validateOwnerPassword(password) {
  if (!ownerSecurityConfigured()) return false;
  return verifyOwnerPassword(password, process.env.SVL_OWNER_PASSWORD_SCRYPT);
}

export function ownerSessionCookieValue() {
  return sessionValue();
}

export { COOKIE as OWNER_COOKIE_NAME };
