import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyOwnerPassword } from "../lib/owner-password.js";

test("salted scrypt password verification", () => {
  const secret = "test-only-string";
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 134217728 });
  const encoded = "scrypt-v1$" + salt.toString("hex") + "$" + hash.toString("hex");
  assert.equal(verifyOwnerPassword(secret, encoded), true);
  assert.equal(verifyOwnerPassword("not-the-same", encoded), false);
});
test("malformed encoded values reject", () => {
  assert.equal(verifyOwnerPassword("test", "invalid"), false);
  assert.equal(verifyOwnerPassword("", ""), false);
});
