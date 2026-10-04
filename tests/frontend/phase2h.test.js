/**
 * Phase 2H — frontend password reset + email verification.
 * Run: npm run test:frontend
 *
 * The real src/ modules (sessionStore, http.js, pages) are compiled with esbuild and
 * run under node:test with in-memory Web Storage and a stubbed fetch. Pages are
 * server-rendered (react-dom/server) inside a MemoryRouter. No network / database.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "../..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  dump() { return JSON.stringify([...this.m.entries()]); }
}
globalThis.localStorage = new MemStorage();
globalThis.sessionStorage = new MemStorage();

const OUT = path.join(ROOT, "node_modules", ".cache", "ss-auth-tests", `phase2h-${process.pid}.cjs`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: `
      export * as http from "./src/api/http.js";
      export * as session from "./src/auth/sessionStore.js";
      export { policyErrors } from "./src/auth/passwordPolicy.js";
      export { AuthProvider } from "./src/context/AuthContext.jsx";
      export { default as ForgotPasswordPage } from "./src/components/Auth/ForgotPasswordPage.jsx";
      export { default as ResetPasswordPage } from "./src/components/Auth/ResetPasswordPage.jsx";
      export { default as VerifyEmailPage } from "./src/components/Auth/VerifyEmailPage.jsx";
      export { default as EmailVerificationBanner } from "./src/components/Common/EmailVerificationBanner.jsx";
    `,
    resolveDir: ROOT, loader: "js", sourcefile: "phase2h-entry.js",
  },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic",
  loader: { ".js": "jsx", ".jsx": "jsx", ".png": "empty", ".jpeg": "empty", ".jpg": "empty", ".svg": "empty", ".webp": "empty" },
  external: ["react", "react-dom", "react-router-dom", "axios"],
  outfile: OUT, logLevel: "error",
});
test.after(() => { try { fs.unlinkSync(OUT); } catch { /* ignore */ } });
const M = require(OUT);

// ── fetch stub ──────────────────────────────────────────────────────────────

let calls = [];
let routes = {};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const call = { url: String(input), method: init.method || "GET", headers: new Headers(init.headers || {}), body: init.body, credentials: init.credentials };
  calls.push(call);
  const handler = routes[`${call.method} ${call.url}`];
  return handler ? handler(call) : json(404, { success: false });
};
const callsTo = (url) => calls.filter((c) => c.url === url);
const bodyOf = (c) => JSON.parse(c.body);

const RAW = "Q".repeat(43); // stand-in one-time token
const ACCESS = "aaa.bbb.ccc";
const BUYER = { role: "buyer", id: "buyer_1", name: "Aisha", email: "a@x.test", email_verified: false };

test.beforeEach(() => {
  calls = []; routes = {};
  localStorage.clear(); sessionStorage.clear();
  M.http.clearAccessToken();
});

const newStore = () => M.session.createSessionStore({ channelFactory: () => null });
async function signedInStore(user = BUYER) {
  routes["POST /api/auth/login"] = () => json(200, { access_token: ACCESS, user });
  const store = newStore();
  const r = await store.login("buyer", user.email, "x");
  assert.equal(r.ok, true);
  return store;
}
const noSecretsInStorage = () => {
  const all = localStorage.dump() + sessionStorage.dump();
  assert.ok(!all.includes(RAW), "one-time token not stored");
  assert.ok(!all.includes(ACCESS), "access token not stored");
};

// ── Store behaviour ─────────────────────────────────────────────────────────

test("normalizeUser carries email_verified (missing → true for legacy accounts)", () => {
  assert.equal(M.session.normalizeUser(BUYER).email_verified, false);
  assert.equal(M.session.normalizeUser({ ...BUYER, email_verified: undefined }).email_verified, true);
});

test("forgotPassword: POSTs {email} with CSRF header + same-origin, returns the generic message", async () => {
  routes["POST /api/auth/forgot-password"] = () => json(200, { success: true, message: "GENERIC" });
  const r = await newStore().forgotPassword("a@x.test");
  assert.deepEqual(r, { ok: true, message: "GENERIC" });
  const c = callsTo("/api/auth/forgot-password")[0];
  assert.deepEqual(bodyOf(c), { email: "a@x.test" });
  assert.equal(c.headers.get("x-requested-with"), "ShaadiSahulat");
  assert.equal(c.credentials, "same-origin");
  assert.equal(c.headers.get("authorization"), null);
});

test("forgotPassword: 429 and network failure map to friendly errors", async () => {
  routes["POST /api/auth/forgot-password"] = () => json(429, { code: "RATE_LIMITED" });
  assert.equal((await newStore().forgotPassword("a@x.test")).error, "Too many attempts. Please try again later.");
  routes["POST /api/auth/forgot-password"] = () => { throw new Error("offline"); };
  assert.match((await newStore().forgotPassword("a@x.test")).error, /Could not reach the server/);
});

test("resetPassword: token only in the POST body (never the URL), no auto-login, notice set", async () => {
  routes["POST /api/auth/reset-password"] = () => json(200, { success: true });
  const store = newStore();
  const r = await store.resetPassword(RAW, "N3w-Passw0rd!");
  assert.equal(r.ok, true);
  const c = callsTo("/api/auth/reset-password")[0];
  assert.deepEqual(bodyOf(c), { token: RAW, password: "N3w-Passw0rd!" });
  assert.ok(!c.url.includes(RAW));
  assert.equal(M.http.getAccessToken(), null, "no access token issued");
  assert.equal(store.getState().status, "loading", "no session established");
  assert.match(store.getState().notice, /reset/i);
  assert.equal(callsTo("/api/auth/login").length + callsTo("/api/auth/refresh").length, 0);
  noSecretsInStorage();
});

test("resetPassword while signed in ends the local session (server revoked every session)", async () => {
  const store = await signedInStore();
  routes["POST /api/auth/reset-password"] = () => json(200, { success: true });
  assert.equal((await store.resetPassword(RAW, "N3w-Passw0rd!")).ok, true);
  assert.equal(store.getState().status, "anonymous");
  assert.equal(M.http.getAccessToken(), null);
  noSecretsInStorage();
});

test("resetPassword: expired / invalid / weak-password responses", async () => {
  const store = newStore();
  routes["POST /api/auth/reset-password"] = () => json(400, { code: "TOKEN_EXPIRED" });
  let r = await store.resetPassword(RAW, "x");
  assert.deepEqual([r.ok, r.expired, r.error], [false, true, "This link has expired. Please request a new one."]);
  routes["POST /api/auth/reset-password"] = () => json(400, { code: "INVALID_OR_EXPIRED_TOKEN" });
  r = await store.resetPassword(RAW, "x");
  assert.deepEqual([r.ok, r.invalid], [false, true]);
  routes["POST /api/auth/reset-password"] = () => json(400, { code: "VALIDATION_ERROR", error: "Must contain a number." });
  r = await store.resetPassword(RAW, "x");
  assert.deepEqual([r.ok, r.expired, r.invalid, r.error], [false, false, false, "Must contain a number."]);
});

test("verifyEmail: verified / already_verified / expired / invalid states", async () => {
  const store = newStore();
  const cases = [
    [200, { success: true, status: "verified" }, "verified"],
    [200, { success: true, status: "already_verified" }, "already_verified"],
    [400, { code: "TOKEN_EXPIRED" }, "expired"],
    [400, { code: "INVALID_OR_EXPIRED_TOKEN" }, "invalid"],
    [500, { success: false }, "error"],
  ];
  for (const [status, body, expected] of cases) {
    routes["POST /api/auth/verify-email"] = () => json(status, body);
    assert.equal((await store.verifyEmail(RAW)).status, expected);
  }
  assert.ok(callsTo("/api/auth/verify-email").every((c) => bodyOf(c).token === RAW && !c.url.includes(RAW)));
  noSecretsInStorage();
});

test("verifyEmail while signed in refreshes the user so the banner disappears", async () => {
  const store = await signedInStore();
  assert.equal(store.getState().user.email_verified, false);
  routes["POST /api/auth/verify-email"] = () => json(200, { success: true, status: "verified" });
  routes["GET /api/auth/me"] = () => json(200, { success: true, user: { ...BUYER, email_verified: true } });
  await store.verifyEmail(RAW);
  assert.equal(store.getState().user.email_verified, true);
});

test("resendVerification: anonymous → by email; signed in → Bearer, no email in the body", async () => {
  routes["POST /api/auth/resend-verification"] = () => json(200, { success: true, message: "GENERIC" });
  assert.deepEqual(await newStore().resendVerification("a@x.test"), { ok: true, message: "GENERIC" });
  let c = callsTo("/api/auth/resend-verification")[0];
  assert.deepEqual(bodyOf(c), { email: "a@x.test" });
  assert.equal(c.headers.get("authorization"), null);

  const store = await signedInStore();
  calls = [];
  assert.equal((await store.resendVerification()).ok, true);
  c = callsTo("/api/auth/resend-verification")[0];
  assert.equal(c.headers.get("authorization"), `Bearer ${ACCESS}`);
  assert.equal(c.headers.get("x-requested-with"), "ShaadiSahulat");
  assert.deepEqual(bodyOf(c), {});
});

test("password policy helper mirrors the backend", () => {
  assert.deepEqual(M.policyErrors("N3w-Passw0rd!"), []);
  assert.ok(M.policyErrors("short1").length);
  assert.ok(M.policyErrors("abcdefgh").length);
  assert.ok(M.policyErrors("12345678").length);
  assert.ok(M.policyErrors("a1@x.test", "a1@x.test").length);
});

// ── Pages (server-rendered) ─────────────────────────────────────────────────

function render(Page, url) {
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const { MemoryRouter } = require("react-router-dom");
  const h = React.createElement;
  return renderToString(h(MemoryRouter, { initialEntries: [url] }, h(M.AuthProvider, null, h(Page))));
}

test("Reset Password page: with a token shows new + confirm fields; without one shows the invalid-link state", () => {
  const withToken = render(M.ResetPasswordPage, `/reset-password?token=${RAW}`);
  assert.ok(withToken.includes('id="rp-new"') && withToken.includes('id="rp-confirm"'));
  assert.ok(!withToken.includes(RAW), "token not rendered into the page");
  const without = render(M.ResetPasswordPage, "/reset-password");
  assert.ok(without.includes("Request a new link"));
  assert.ok(!without.includes('id="rp-new"'));
});

test("Verify Email page: token → verifying state; no token → invalid state with resend form", () => {
  const withToken = render(M.VerifyEmailPage, `/verify-email?token=${RAW}`);
  assert.ok(withToken.includes("Checking your link"));
  assert.ok(!withToken.includes(RAW));
  const without = render(M.VerifyEmailPage, "/verify-email");
  assert.ok(without.includes("Invalid Link"));
  assert.ok(without.includes("Send a new verification link"));
});

test("Forgot Password page renders the email form and a portal-specific back link", () => {
  const html = render(M.ForgotPasswordPage, "/forgot-password?portal=seller");
  assert.ok(html.includes('id="fp-email"'));
  assert.ok(html.includes("Seller Sign In"));
  assert.ok(!render(M.ForgotPasswordPage, "/forgot-password?portal=evil").includes("Sign In</button>"));
});

// ── Source checks ───────────────────────────────────────────────────────────

const PAGES = ["src/components/Auth/AuthShell.jsx", "src/components/Auth/ForgotPasswordPage.jsx",
  "src/components/Auth/ResetPasswordPage.jsx", "src/components/Auth/VerifyEmailPage.jsx",
  "src/components/Common/EmailVerificationBanner.jsx"];

test("reset/verify pages never use Web Storage and strip ?token= with a replace navigation", () => {
  for (const f of PAGES) {
    const src = stripComments(read(f));
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), `${f} uses storage`);
    assert.ok(!/console\.(log|info|warn|error)/.test(src), `${f} logs`);
  }
  const shell = stripComments(read("src/components/Auth/AuthShell.jsx"));
  assert.match(shell, /params\.delete\('token'\)/);
  assert.match(shell, /navigate\([^)]*\{ replace: true \}\)/);
  const store = stripComments(read("src/auth/sessionStore.js"));
  assert.ok(!/localStorage|sessionStorage/.test(store));
});

test("routes + entry points: public /forgot-password, /reset-password, /verify-email; forgot links on all login pages", () => {
  const app = read("src/App.jsx");
  for (const p of ["/forgot-password", "/reset-password", "/verify-email"]) {
    assert.ok(new RegExp(`<Route path="${p}"`).test(app), p);
  }
  assert.ok(!/RequireRole[^\n]*(forgot|reset|verify)/i.test(app), "pages are public");
  assert.match(read("src/components/Buyer/BuyerAuthPage.jsx"), /forgot-password\?portal=buyer/);
  assert.match(read("src/components/Seller/SellerAuthPage.jsx"), /forgot-password\?portal=seller/);
  assert.match(read("src/components/Admin/AdminLogin.jsx"), /forgot-password\?portal=admin/);
  assert.equal((app.match(/<EmailVerificationBanner/g) || []).length, 2, "banner on buyer + seller account pages");
  assert.ok(!/admin[^\n]*register|registerAdmin/i.test(stripComments(read("src/auth/sessionStore.js"))), "no admin signup");
});
