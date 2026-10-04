/**
 * Phase 2E — frontend session/auth tests.
 * Run: npm run test:frontend
 *
 * No extra packages: the real src/ modules are compiled on the fly with esbuild
 * (shipped with Vite) and executed under node:test with in-memory Web Storage and a
 * stubbed global fetch. Nothing touches the network or a database.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "../..");

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ── In-memory Web Storage ───────────────────────────────────────────────────

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  dump() { return [...this.m.entries()]; }
}
globalThis.localStorage = new MemStorage();
globalThis.sessionStorage = new MemStorage();

// ── Build the modules under test (once) ─────────────────────────────────────

// Written under node_modules/.cache (git-ignored) so external packages resolve.
const OUT = path.join(ROOT, "node_modules", ".cache", "ss-auth-tests", `phase2e-${process.pid}.cjs`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: `
      export * as http from "./src/api/http.js";
      export * as guard from "./src/auth/guard.js";
      export * as storage from "./src/auth/authStorage.js";
      export * as session from "./src/auth/sessionStore.js";
      export { default as RequireRole, AuthLoading } from "./src/auth/RequireRole.jsx";
      export { AuthProvider, useAuth } from "./src/context/AuthContext.jsx";
    `,
    resolveDir: ROOT,
    loader: "js",
    sourcefile: "phase2e-entry.js",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  loader: { ".js": "jsx", ".jsx": "jsx" },
  external: ["react", "react-dom", "react-router-dom", "axios"],
  outfile: OUT,
  logLevel: "error",
});
test.after(() => { try { fs.unlinkSync(OUT); } catch { /* ignore */ } });

function loadFresh() {
  delete require.cache[require.resolve(OUT)];
  return require(OUT);
}

// ── fetch stub ──────────────────────────────────────────────────────────────

let calls = [];
let routes = {};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const headers = new Headers(init.headers || {});
  const call = { url, method: init.method || "GET", headers, body: init.body, credentials: init.credentials };
  calls.push(call);
  const handler = routes[`${call.method} ${url}`] || routes[url];
  if (!handler) return json(404, { success: false });
  return handler(call);
};
const callsTo = (url) => calls.filter((c) => c.url === url);

const TOKEN_A = "aaa.bbb.ccc";
const TOKEN_B = "ddd.eee.fff";
const BUYER = { role: "buyer", id: "buyer_1", name: "Aisha", email: "a@x.test" };
const PROFILE = { buyer_id: "buyer_1", name: "Aisha", email: "a@x.test", wishlist_items: [{ product_id: "p1" }] };

let M = loadFresh();

function reset() {
  calls = [];
  routes = {};
  localStorage.clear();
  sessionStorage.clear();
  M.http.clearAccessToken();
}

function newStore(extra = {}) {
  return M.session.createSessionStore({ channelFactory: () => null, ...extra });
}

test.beforeEach(reset);

// ── Startup / restore ───────────────────────────────────────────────────────

test("app starts with no localStorage auth: loading → anonymous when refresh fails", async () => {
  routes["POST /api/auth/refresh"] = () => json(401, { success: false, code: "NO_SESSION" });
  const store = newStore();
  assert.equal(store.getState().status, "loading");
  await store.start();
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
  assert.equal(localStorage.length, 0);
  store.stop();
});

test("refresh successfully restores a session via /refresh + /me (cookie, relative URL, CSRF header)", async () => {
  routes["POST /api/auth/refresh"] = () => json(200, { access_token: TOKEN_A, user: BUYER });
  routes["GET /api/auth/me"] = () => json(200, { success: true, user: { ...BUYER, profile: PROFILE } });
  const warmed = [];
  const store = newStore({ onBuyerSignedIn: (p) => warmed.push(p) });
  await store.start();
  const s = store.getState();
  assert.equal(s.status, "authenticated");
  assert.deepEqual([s.user.role, s.user.id, s.user.profile.buyer_id], ["buyer", "buyer_1", "buyer_1"]);
  assert.equal(M.http.getAccessToken(), TOKEN_A);
  const r = callsTo("/api/auth/refresh")[0];
  assert.equal(r.credentials, "same-origin");
  assert.equal(r.headers.get("x-requested-with"), "ShaadiSahulat");
  assert.equal(callsTo("/api/auth/me")[0].headers.get("authorization"), `Bearer ${TOKEN_A}`);
  assert.equal(warmed.length, 1, "buyer caches warmed from the verified profile");
  store.stop();
});

test("refresh failure (or /me failure) produces anonymous state", async () => {
  routes["POST /api/auth/refresh"] = () => json(200, { access_token: TOKEN_A, user: BUYER });
  routes["GET /api/auth/me"] = () => json(401, { success: false });
  const store = newStore();
  await store.start();
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
  store.stop();
});

test("old ss_* values cannot grant a role and are purged at load without being used", async () => {
  localStorage.setItem("ss_buyer", JSON.stringify({ buyer_id: "forged_buyer" }));
  localStorage.setItem("ss_seller", JSON.stringify({ seller_id: "forged_seller" }));
  localStorage.setItem("ss_admin", JSON.stringify({ admin_id: "admin_001" }));
  localStorage.setItem("ss_auth_changed", "1");
  sessionStorage.setItem("ss_active_role", "admin");
  localStorage.setItem("ss_cart_buyer_1", "[1]"); // unrelated data must survive
  M = loadFresh(); // AuthContext module load runs the purge
  for (const k of ["ss_buyer", "ss_seller", "ss_admin", "ss_auth_changed"]) assert.equal(localStorage.getItem(k), null, k);
  assert.equal(sessionStorage.getItem("ss_active_role"), null);
  assert.equal(localStorage.getItem("ss_cart_buyer_1"), "[1]");

  routes["POST /api/auth/refresh"] = () => json(401, { success: false });
  const store = newStore();
  await store.start();
  assert.equal(store.getState().status, "anonymous", "forged storage never authenticates");
  assert.equal(calls.length, 1, "no request used the forged identity");
  assert.ok(!calls.some((c) => c.headers.has("x-user-id") || c.headers.has("x-user-role")));
  store.stop();
});

// ── Login / register ────────────────────────────────────────────────────────

for (const portal of ["buyer", "seller", "admin"]) {
  test(`login${portal[0].toUpperCase()}${portal.slice(1)} posts portal:"${portal}" to relative /api/auth/login`, async () => {
    routes["POST /api/auth/login"] = (c) => {
      const b = JSON.parse(c.body);
      return json(200, { access_token: TOKEN_A, user: { role: b.portal, id: `${b.portal}_1`, name: "N", email: b.email }, profile: {} });
    };
    const store = newStore();
    const r = await store.login(portal, "u@x.test", "Passw0rd!");
    assert.equal(r.ok, true);
    const c = callsTo("/api/auth/login")[0];
    assert.deepEqual(JSON.parse(c.body), { portal, email: "u@x.test", password: "Passw0rd!" });
    assert.equal(c.credentials, "same-origin");
    assert.equal(c.headers.get("x-requested-with"), "ShaadiSahulat");
    assert.ok(!c.headers.has("x-user-id") && !c.headers.has("x-user-role"));
    assert.equal(store.getState().user.role, portal);
    assert.equal(M.http.getAccessToken(), TOKEN_A);
  });
}

test("login failure maps to a safe message and stays anonymous; 429 shows rate-limit text", async () => {
  routes["POST /api/auth/login"] = () => json(401, { success: false, code: "INVALID_CREDENTIALS", error: "Invalid email or password." });
  const store = newStore();
  const r = await store.login("buyer", "u@x.test", "bad");
  assert.deepEqual(r, { ok: false, error: "Invalid email or password." });
  assert.equal(M.http.getAccessToken(), null);
  routes["POST /api/auth/login"] = () => json(429, { success: false, code: "RATE_LIMITED" });
  assert.equal((await store.login("buyer", "u@x.test", "bad")).error, "Too many attempts. Please try again later.");
  assert.equal(callsTo("/api/auth/refresh").length, 0, "auth-endpoint 401s never trigger refresh");
});

test("registration uses /api/auth/buyer/register and /api/auth/seller/register; no admin registration", async () => {
  // OTP-first: register answers 202 verification_required (no session yet).
  routes["POST /api/auth/buyer/register"] = () => json(202, { success: true, verification_required: true, email: "a@x.test", registration_token: "t".repeat(43), otp_expires_in: 600, resend_after: 60 });
  routes["POST /api/auth/seller/register"] = () => json(400, { success: false, code: "VALIDATION_ERROR", error: "A valid email is required." });
  const store = newStore();
  const buyer = await store.register("buyer", { name: "A", email: "a@x.test", password: "Passw0rd1" });
  assert.equal(buyer.ok, true);
  assert.equal(buyer.pending.email, "a@x.test");
  assert.equal(M.http.getAccessToken(), null, "no session before the OTP is verified");
  const seller = await store.register("seller", { name: "S", email: "s@x.test", password: "Passw0rd1", seller_type: "company" });
  assert.deepEqual(seller, { ok: false, error: "A valid email is required." });
  assert.equal(JSON.parse(callsTo("/api/auth/seller/register")[0].body).seller_type, "company");
  const before = calls.length;
  assert.equal((await store.register("admin", { email: "x@x.test" })).ok, false);
  assert.equal(calls.length, before, "admin registration makes no request");
});

test("access token stays in memory only (never in localStorage / sessionStorage)", async () => {
  routes["POST /api/auth/login"] = () => json(200, { access_token: TOKEN_A, user: BUYER, profile: PROFILE });
  const store = newStore({ onBuyerSignedIn: (p) => localStorage.setItem(`ss_wishlist_${p.buyer_id}`, "[]") });
  await store.login("buyer", "a@x.test", "Passw0rd1");
  const everything = JSON.stringify([...localStorage.dump(), ...sessionStorage.dump()]);
  assert.ok(!everything.includes(TOKEN_A));
  assert.ok(!/eyJ|Bearer|access_token/.test(everything));
  assert.equal(M.http.getAccessToken(), TOKEN_A);
});

// ── authFetch ───────────────────────────────────────────────────────────────

test("401 triggers exactly ONE refresh for concurrent requests; each original request is retried once", async () => {
  M.http.setAccessToken(TOKEN_A);
  let refreshes = 0;
  routes["POST /api/auth/refresh"] = async () => {
    refreshes++;
    await new Promise((r) => setTimeout(r, 20));
    return json(200, { access_token: TOKEN_B });
  };
  const api = (c) => (c.headers.get("authorization") === `Bearer ${TOKEN_B}` ? json(200, { ok: true }) : json(401, { code: "TOKEN_EXPIRED" }));
  routes["http://localhost:5000/api/a"] = api;
  routes["http://localhost:5000/api/b"] = api;
  const [ra, rb] = await Promise.all([
    M.http.authFetch("http://localhost:5000/api/a"),
    M.http.authFetch("http://localhost:5000/api/b"),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal(callsTo("http://localhost:5000/api/a").length, 2, "original + one retry");
  assert.equal(callsTo("http://localhost:5000/api/b").length, 2);
  assert.equal(M.http.getAccessToken(), TOKEN_B);
});

test("successful refresh retries the original request with the new token (body/method preserved)", async () => {
  M.http.setAccessToken(TOKEN_A);
  routes["POST /api/auth/refresh"] = () => json(200, { access_token: TOKEN_B });
  routes["POST http://localhost:5000/api/orders/"] = (c) =>
    c.headers.get("authorization") === `Bearer ${TOKEN_B}` ? json(201, { ok: true, echo: JSON.parse(c.body) }) : json(401, {});
  const res = await M.http.authFetch("http://localhost:5000/api/orders/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [1] }),
  });
  assert.equal(res.status, 201);
  assert.deepEqual((await res.json()).echo, { items: [1] });
});

test("failed refresh does not loop: one API call, one refresh, session-expired emitted once", async () => {
  M.http.setAccessToken(TOKEN_A);
  routes["POST /api/auth/refresh"] = () => json(401, { code: "REFRESH_INVALID" });
  routes["http://localhost:5000/api/x"] = () => json(401, { code: "TOKEN_EXPIRED" });
  const events = [];
  const off = M.http.onAuthEvent((e) => events.push(e.type));
  const res = await M.http.authFetch("http://localhost:5000/api/x");
  off();
  assert.equal(res.status, 401);
  assert.equal(callsTo("http://localhost:5000/api/x").length, 1);
  assert.equal(callsTo("/api/auth/refresh").length, 1);
  assert.deepEqual(events, ["session-expired"]);
  assert.equal(M.http.getAccessToken(), null);
});

test("a retried request that still returns 401 is not refreshed again", async () => {
  M.http.setAccessToken(TOKEN_A);
  routes["POST /api/auth/refresh"] = () => json(200, { access_token: TOKEN_B });
  routes["http://localhost:5000/api/y"] = () => json(401, {});
  const res = await M.http.authFetch("http://localhost:5000/api/y");
  assert.equal(res.status, 401);
  assert.equal(callsTo("/api/auth/refresh").length, 1);
  assert.equal(callsTo("http://localhost:5000/api/y").length, 2);
});

test("403 is returned as-is and never triggers refresh", async () => {
  M.http.setAccessToken(TOKEN_A);
  routes["http://localhost:5000/api/admin/stats"] = () => json(403, { code: "FORBIDDEN_ROLE" });
  const events = [];
  const off = M.http.onAuthEvent((e) => events.push(e.type));
  const res = await M.http.authFetch("http://localhost:5000/api/admin/stats");
  off();
  assert.equal(res.status, 403);
  assert.equal(callsTo("/api/auth/refresh").length, 0);
  assert.deepEqual(events, ["forbidden"]);
  assert.equal(M.http.getAccessToken(), TOKEN_A, "403 does not end the session");
});

test("anonymous 401 (no token sent) does not attempt refresh", async () => {
  routes["http://localhost:5000/api/z"] = () => json(401, {});
  await M.http.authFetch("http://localhost:5000/api/z");
  assert.equal(callsTo("/api/auth/refresh").length, 0);
});

test("authFetch sends Bearer and strips any x-user-id / x-user-role a caller passes", async () => {
  M.http.setAccessToken(TOKEN_A);
  routes["http://localhost:5000/api/q"] = () => json(200, {});
  await M.http.authFetch("http://localhost:5000/api/q", { headers: { "x-user-id": "admin_001", "x-user-role": "admin" } });
  const c = callsTo("http://localhost:5000/api/q")[0];
  assert.equal(c.headers.get("authorization"), `Bearer ${TOKEN_A}`);
  assert.ok(!c.headers.has("x-user-id") && !c.headers.has("x-user-role"));
});

test("authAxios: Bearer header, one refresh + retry on 401, no refresh on 403", async () => {
  const axios = require("axios");
  const seen = [];
  M.http.authAxios.defaults.adapter = async (config) => {
    const auth = config.headers?.Authorization || config.headers?.get?.("Authorization");
    seen.push({ url: config.url, auth });
    const respond = (status) => {
      const response = { data: {}, status, statusText: String(status), headers: {}, config };
      if (status >= 400) throw new axios.AxiosError("fail", "ERR", config, null, response);
      return response;
    };
    if (config.url === "/api/forbidden") return respond(403);
    return respond(auth === `Bearer ${TOKEN_B}` ? 200 : 401);
  };
  M.http.setAccessToken(TOKEN_A);
  routes["POST /api/auth/refresh"] = () => json(200, { access_token: TOKEN_B });
  const ok = await M.http.authAxios.get("/api/dowry/by-user/buyer_1");
  assert.equal(ok.status, 200);
  assert.deepEqual(seen.map((s) => s.auth), [`Bearer ${TOKEN_A}`, `Bearer ${TOKEN_B}`]);
  assert.equal(callsTo("/api/auth/refresh").length, 1);
  await assert.rejects(M.http.authAxios.get("/api/forbidden"), (e) => e.response.status === 403);
  assert.equal(callsTo("/api/auth/refresh").length, 1, "403 did not refresh");
});

// ── Logout / change password / expiry ───────────────────────────────────────

async function signedInStore() {
  routes["POST /api/auth/login"] = () => json(200, { access_token: TOKEN_A, user: BUYER, profile: PROFILE });
  const store = newStore();
  await store.login("buyer", "a@x.test", "Passw0rd1");
  return store;
}

test("logout calls the backend (cookie + Bearer) and clears memory state and shared caches", async () => {
  const store = await signedInStore();
  localStorage.setItem("ss_dowry_latest", "{}");
  localStorage.setItem("ss_dowry_buyer_1", "{}");
  localStorage.setItem("ss_wishlist_buyer_1", "[]");
  localStorage.setItem("ss_cart_buyer_1", "[{\"product_id\":\"p\"}]");
  routes["POST /api/auth/logout"] = () => json(200, { success: true });
  await store.logout();
  const c = callsTo("/api/auth/logout")[0];
  assert.equal(c.credentials, "same-origin");
  assert.equal(c.headers.get("authorization"), `Bearer ${TOKEN_A}`);
  assert.equal(c.headers.get("x-requested-with"), "ShaadiSahulat");
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
  assert.equal(localStorage.getItem("ss_dowry_latest"), null);
  assert.equal(localStorage.getItem("ss_dowry_buyer_1"), null);
  assert.equal(localStorage.getItem("ss_wishlist_buyer_1"), null);
  assert.ok(localStorage.getItem("ss_cart_buyer_1"), "cart kept (not DB-synced)");
});

test("logout still ends the local session if the network fails", async () => {
  const store = await signedInStore();
  routes["POST /api/auth/logout"] = () => { throw new TypeError("network down"); };
  await store.logout();
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
});

test("change-password success clears authentication and asks for a fresh login", async () => {
  const store = await signedInStore();
  routes["POST /api/auth/change-password"] = (c) => {
    assert.equal(c.headers.get("authorization"), `Bearer ${TOKEN_A}`);
    assert.deepEqual(JSON.parse(c.body), { currentPassword: "Old-Passw0rd", newPassword: "New-Passw0rd1" });
    return json(200, { success: true, message: "Password changed. Please sign in again." });
  };
  const r = await store.changePassword("Old-Passw0rd", "New-Passw0rd1");
  assert.deepEqual(r, { ok: true });
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
  assert.match(store.getState().notice, /Password changed/);
});

test("change-password failure keeps the session and shows a safe message", async () => {
  const store = await signedInStore();
  routes["POST /api/auth/change-password"] = () => json(400, { success: false, code: "INVALID_CURRENT_PASSWORD", error: "x" });
  const r = await store.changePassword("wrong", "New-Passw0rd1");
  assert.deepEqual(r, { ok: false, error: "Current password is incorrect." });
  assert.equal(store.getState().status, "authenticated");
  assert.equal(M.http.getAccessToken(), TOKEN_A);
});

test("session-expired event ends an authenticated session with a notice", async () => {
  const store = await signedInStore();
  routes["POST /api/auth/refresh"] = () => json(401, {});
  await store.start(); // wires events (restore fails → anonymous as well)
  const store2 = await signedInStore();
  store2.start();
  routes["http://localhost:5000/api/orders"] = () => json(401, {});
  M.http.setAccessToken(TOKEN_A);
  await M.http.authFetch("http://localhost:5000/api/orders");
  assert.equal(store2.getState().status, "anonymous");
  store.stop();
  store2.stop();
});

test("cross-tab: logout in one tab signs out the other (BroadcastChannel)", async () => {
  if (typeof BroadcastChannel === "undefined") return;
  routes["POST /api/auth/refresh"] = () => json(401, {});
  const tabA = M.session.createSessionStore();
  const tabB = M.session.createSessionStore();
  await Promise.all([tabA.start(), tabB.start()]);
  routes["POST /api/auth/login"] = () => json(200, { access_token: TOKEN_A, user: BUYER, profile: PROFILE });
  await tabB.login("buyer", "a@x.test", "Passw0rd1");
  routes["POST /api/auth/logout"] = () => json(200, {});
  await tabA.logout();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(tabB.getState().status, "anonymous");
  tabA.stop();
  tabB.stop();
});

// ── Guards ──────────────────────────────────────────────────────────────────

test("RequireRole decisions: loading waits; anonymous → login; wrong role → own dashboard; right role → allow", () => {
  const { guardDecision } = M.guard;
  for (const role of ["buyer", "seller", "admin"]) {
    assert.deepEqual(guardDecision({ status: "loading" }, role), { type: "loading" });
    assert.equal(guardDecision({ status: "anonymous", user: null }, role).to, `/${role}/login`);
  }
  const as = (role) => ({ status: "authenticated", user: { role, id: "x" } });
  assert.deepEqual(guardDecision(as("buyer"), "seller"), { type: "redirect", to: "/buyer/dashboard", reason: "wrong-role" });
  assert.deepEqual(guardDecision(as("buyer"), "admin"), { type: "redirect", to: "/buyer/dashboard", reason: "wrong-role" });
  assert.deepEqual(guardDecision(as("seller"), "buyer"), { type: "redirect", to: "/seller/dashboard", reason: "wrong-role" });
  assert.deepEqual(guardDecision(as("seller"), "admin"), { type: "redirect", to: "/seller/dashboard", reason: "wrong-role" });
  assert.deepEqual(guardDecision(as("admin"), "buyer"), { type: "redirect", to: "/admin/dashboard", reason: "wrong-role" });
  assert.deepEqual(guardDecision(as("admin"), "seller"), { type: "redirect", to: "/admin/dashboard", reason: "wrong-role" });
  for (const role of ["buyer", "seller", "admin"]) assert.deepEqual(guardDecision(as(role), role), { type: "allow" });
  assert.equal(guardDecision({ status: "authenticated", user: { role: "superadmin" } }, "admin").reason, "anonymous");
});

test("?as= / stored roles cannot grant a role; post-login redirect stays within the verified role", () => {
  const { guardDecision, postLoginPath } = M.guard;
  sessionStorage.setItem("ss_active_role", "admin");
  localStorage.setItem("ss_admin", "{}");
  assert.equal(guardDecision({ status: "anonymous" }, "admin").to, "/admin/login");
  assert.equal(postLoginPath("buyer", "/admin/dashboard?as=admin"), "/buyer/dashboard");
  assert.equal(postLoginPath("buyer", "/buyer/orders?as=admin"), "/buyer/orders?as=admin");
  assert.equal(postLoginPath("seller", "//evil.example/x"), "/seller/dashboard");
  assert.equal(postLoginPath("buyer", "/bnpl/apply/ORD-1"), "/bnpl/apply/ORD-1");
  assert.equal(postLoginPath("admin", undefined), "/admin/dashboard");

  const app = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  const dispute = stripComments(app.slice(app.indexOf("function DisputeChatWrapper"), app.indexOf("// ── Login pages")));
  assert.ok(!/get\(["']as["']\)|asRole|sessionStorage|localStorage/.test(dispute), "dispute chat role comes only from the session");
});

test("RequireRole renders a placeholder (not protected content) while the session is loading", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const { MemoryRouter, Routes, Route } = require("react-router-dom");
  const h = React.createElement;
  const html = renderToString(
    h(MemoryRouter, { initialEntries: ["/buyer/orders"] },
      h(M.AuthProvider, null,
        h(Routes, null,
          h(Route, { path: "/buyer", element: h(M.RequireRole, { role: "buyer" }) },
            h(Route, { path: "orders", element: h("div", null, "PROTECTED-CONTENT") }))))));
  assert.ok(html.includes("Checking your session"));
  assert.ok(!html.includes("PROTECTED-CONTENT"));
});

// ── Source scans ────────────────────────────────────────────────────────────

function srcFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? srcFiles(p) : /\.(jsx?|tsx?)$/.test(d.name) ? [p] : [];
  });
}

test("frontend code no longer sends x-user-id / x-user-role or reads ss_buyer/ss_seller/ss_admin", () => {
  const offenders = [];
  for (const f of srcFiles(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const code = stripComments(fs.readFileSync(f, "utf8"));
    if (/["'`]x-user-(id|role)["'`]\s*:/.test(code)) offenders.push(`${rel}: sets x-user-*`);
    if (/(getItem|setItem)\(\s*["'`]ss_(buyer|seller|admin|active_role)["'`]/.test(code)) offenders.push(`${rel}: ss_* storage`);
    if (/ss_auth_changed/.test(code) && !rel.endsWith("auth/authStorage.js")) offenders.push(`${rel}: ss_auth_changed`);
  }
  assert.deepEqual(offenders, []);
});

test("no access token is written to storage, URLs or query strings in source", () => {
  for (const f of srcFiles(path.join(ROOT, "src"))) {
    const code = stripComments(fs.readFileSync(f, "utf8"));
    assert.ok(!/(localStorage|sessionStorage)\.setItem\([^)]*(token|jwt)/i.test(code), f);
    assert.ok(!/[?&](access_)?token=\$\{/.test(code) || /by-token/.test(code), f);
  }
});
