import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Read-only dashboard fetch caches for navigation", () => {
  const src = read("lib/live.js");
  assert.match(src, /revalidate:\s*180,\s*tags:\s*\["svl-google"\]/);
  assert.match(src, /signal:\s*AbortSignal\.timeout\(18000\)/);
});

test("Paid-action and batch endpoints retain fresh CURRENT reads", () => {
  for (const path of ["app/api/actions/run/route.js", "app/api/actions/batch/route.js"]) {
    assert.match(read(path), /getDashboardData\(\{ fresh: true \}\)/, path);
  }
  assert.match(read("lib/live.js"), /options\.fresh\s*\?\s*\{ cache: "no-store" \}/);
});

test("Action Center does not defeat read-only caching by forcing no-store", () => {
  const src = read("app/actions/page.js");
  assert.doesNotMatch(src, /export const dynamic = ["']force-dynamic["']/);
  assert.doesNotMatch(src, /export const revalidate = 0/);
  assert.match(src, /isOwnerAuthorized\(/);
});

test("ChatGPT page preserves owner auth without disabling caching", () => {
  const src = read("app/ai/page.js");
  assert.doesNotMatch(src, /export const dynamic = ["']force-dynamic["']/);
  assert.doesNotMatch(src, /export const revalidate = 0/);
  assert.match(src, /isOwnerAuthorized\(/);
});

test("News no longer blocks Actions and Home render", () => {
  for (const path of ["app/actions/page.js", "app/page.js"]) {
    const src = read(path);
    assert.match(src, /<Suspense fallback=\{null\}>/);
    assert.match(src, /<DeferredNewsWatch sports=\{data\.sports\} \/>/);
    assert.doesNotMatch(src, /const news = await getNewsWatch\(data\.sports\)/);
  }
});

test("News is advisory with a bounded timeout", () => {
  assert.match(read("lib/news-watch.js"), /AbortSignal\.timeout\(1500\)/);
});

test("Navigation displays a route shell while CURRENT loads", () => {
  const src = read("app/loading.js");
  assert.match(src, /<AppNav \/>/);
  assert.match(src, /role="status"/);
  assert.doesNotMatch(src, /LIVE ·/);
});

test("Scope, runner, paid consent and owner gates stay in place", () => {
  const policy = read("lib/action-policy.js");
  const run = read("app/api/actions/run/route.js");
  assert.match(policy, /paidScopeBlocked/);
  assert.match(policy, /runnerConfigured/);
  assert.match(policy, /def\.paid && !confirmPaid/);
  assert.match(run, /isOwnerAuthorized\(/);
  assert.match(run, /validateActionRequest\(/);
});
