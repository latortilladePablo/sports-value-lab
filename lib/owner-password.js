import crypto from "node:crypto";

// Password verifier only; the internal session signing token stays independent.
// Format: scrypt-v1$<16-byte salt hex>$<32-byte derived key hex>
export function verifyOwnerPassword(supplied, encoded) {
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > 1024) return false;
  const match = /^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(String(encoded || ""));
  if (!match) return false;
  try {
    const salt = Buffer.from(match[1], "hex");
    const expected = Buffer.from(match[2], "hex");
    const actual = crypto.scryptSync(supplied, salt, expected.length, {
      N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
