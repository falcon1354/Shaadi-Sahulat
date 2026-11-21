/**
 * Route-table guard test (security audit 2026-11-20).
 * Every buyer/seller/admin/BNPL page must sit behind its role guard, and the two pages that
 * guard themselves (bank officer dashboard, dispute chat) must redirect anonymous visitors.
 * This catches a newly added dashboard route that someone forgets to protect.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
const app = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");

// Top-level routes = absolute paths (child routes inside a guarded parent use relative paths).
const topLevel = [...app.matchAll(/<Route\s+path="(\/[^"]*)"\s+element=\{<([A-Za-z]+)/g)].map((m) => ({ path: m[1], element: m[2] }));

const GUARD = { buyer: "RequireBuyer", seller: "RequireSeller", admin: "RequireAdmin", bnpl: "RequireBuyer" };
const PUBLIC = new Set(["/buyer/login", "/seller/login", "/admin/login", "/bank/login"]);

test("route table was parsed", () => {
  assert.ok(topLevel.length >= 10, `found ${topLevel.length} top-level routes`);
});

test("every top-level buyer/seller/admin/bnpl route is wrapped in its role guard", () => {
  const unguarded = topLevel.filter((r) => {
    const area = r.path.split("/")[1];
    if (!GUARD[area] || PUBLIC.has(r.path)) return false;
    return r.element !== GUARD[area];
  });
  assert.deepEqual(unguarded, [], `unguarded protected routes: ${JSON.stringify(unguarded)}`);
});

test("guarded parents exist for buyer, seller, admin and BNPL apply", () => {
  for (const [p, g] of [["/buyer", "RequireBuyer"], ["/seller", "RequireSeller"], ["/admin", "RequireAdmin"], ["/bnpl/apply/:orderId", "RequireBuyer"]]) {
    assert.ok(topLevel.some((r) => r.path === p && r.element === g), `${p} → ${g}`);
  }
});

test("only known self-guarding pages are mounted outside a role guard", () => {
  const others = topLevel.filter((r) => !["buyer", "seller", "admin", "bnpl"].includes(r.path.split("/")[1]) && r.path !== "/" && r.path !== "*")
    .map((r) => r.path).sort();
  assert.deepEqual(others, ["/bank/dashboard", "/bank/login", "/disputes/:disputeId", "/forgot-password", "/reset-password", "/verify-email"].sort());
});

test("bank dashboard redirects to /bank/login when no officer session exists", () => {
  const bank = fs.readFileSync(path.join(SRC, "components", "Bank", "BankDashboardPage.jsx"), "utf8");
  assert.match(bank, /getOfficerFromStorage\(\)[\s\S]{0,80}if \(!o\) \{ navigate\("\/bank\/login"\)/);
});

test("dispute chat renders only for a server-verified session", () => {
  const wrapper = app.slice(app.indexOf("function DisputeChatWrapper"), app.indexOf("function DisputeChatWrapper") + 800);
  assert.match(wrapper, /status === "loading"\) return <AuthLoading/);
  assert.match(wrapper, /status !== "authenticated" \|\| !user\) return <Navigate/);
});
