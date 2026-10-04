/**
 * Frontend OTP-first registration: session store + OTP screen.
 * Run: npm run test:frontend
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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

const OUT = path.join(ROOT, "node_modules", ".cache", "ss-auth-tests", `regotp-${process.pid}.cjs`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: `
      export * as http from "./src/api/http.js";
      export * as session from "./src/auth/sessionStore.js";
      export { AuthProvider } from "./src/context/AuthContext.jsx";
      export { default as RegistrationOtpPanel } from "./src/components/Auth/RegistrationOtpPanel.jsx";
    `,
    resolveDir: ROOT, loader: "js", sourcefile: "regotp-entry.js",
  },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic",
  loader: { ".js": "jsx", ".jsx": "jsx", ".png": "empty", ".jpeg": "empty", ".jpg": "empty" },
  external: ["react", "react-dom", "react-router-dom", "axios"],
  outfile: OUT, logLevel: "error",
});
test.after(() => { try { fs.unlinkSync(OUT); } catch { /* ignore */ } });
const M = require(OUT);

let calls = [];
let routes = {};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const call = { url: String(input), method: init.method || "GET", headers: new Headers(init.headers || {}), body: init.body };
  calls.push(call);
  const h = routes[`${call.method} ${call.url}`];
  return h ? h(call) : json(404, {});
};
const bodyOf = (c) => JSON.parse(c.body);
const TOKEN = "r".repeat(43);
const ACCESS = "aaa.bbb.ccc";
const PENDING_BODY = { success: true, verification_required: true, portal: "buyer", email: "a@x.test", registration_token: TOKEN, otp_expires_in: 600, resend_after: 60, message: "We sent a code" };

test.beforeEach(() => { calls = []; routes = {}; localStorage.clear(); sessionStorage.clear(); M.http.clearAccessToken(); });
const newStore = () => M.session.createSessionStore({ channelFactory: () => null });

test("register returns a pending sign-up (no session, nothing stored)", async () => {
  routes["POST /api/auth/buyer/register"] = () => json(202, PENDING_BODY);
  const store = newStore();
  const r = await store.register("buyer", { name: "A", email: "a@x.test", password: "Passw0rd1" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.pending, { portal: "buyer", email: "a@x.test", registrationToken: TOKEN, otpExpiresIn: 600, resendAfter: 60, message: "We sent a code" });
  assert.equal(store.getState().status, "loading", "not signed in");
  assert.equal(M.http.getAccessToken(), null);
  assert.ok(!(localStorage.dump() + sessionStorage.dump()).includes(TOKEN), "registration token not stored");
  assert.ok(!(localStorage.dump() + sessionStorage.dump()).includes("Passw0rd1"));
});

test("verifyRegistration posts portal/email/otp/token and signs the new user in", async () => {
  routes["POST /api/auth/register/verify"] = () => json(201, { access_token: ACCESS, user: { role: "buyer", id: "buyer_1", name: "A", email: "a@x.test", email_verified: true } });
  const store = newStore();
  const pending = { portal: "buyer", email: "a@x.test", registrationToken: TOKEN };
  const r = await store.verifyRegistration(pending, "123456");
  assert.equal(r.ok, true);
  assert.deepEqual(bodyOf(calls[0]), { portal: "buyer", email: "a@x.test", otp: "123456", registration_token: TOKEN });
  assert.equal(calls[0].headers.get("x-requested-with"), "ShaadiSahulat");
  assert.equal(store.getState().status, "authenticated");
  assert.equal(M.http.getAccessToken(), ACCESS);
  assert.equal(localStorage.length, 0);
});

test("verifyRegistration maps wrong / expired / too-many-attempts errors (and stays signed out)", async () => {
  const store = newStore();
  const pending = { portal: "seller", email: "s@x.test", registrationToken: TOKEN };
  const cases = [
    [400, { code: "INVALID_OTP", attempts_remaining: 3 }, /incorrect\. 3 attempts left/],
    [400, { code: "OTP_EXPIRED" }, /expired/],
    [429, { code: "TOO_MANY_ATTEMPTS" }, /Too many/],
    [409, { code: "EMAIL_IN_USE" }, /already registered/],
  ];
  for (const [status, body, re] of cases) {
    routes["POST /api/auth/register/verify"] = () => json(status, body);
    const r = await store.verifyRegistration(pending, "000000");
    assert.equal(r.ok, false);
    assert.match(r.error, re);
    assert.equal(r.code, body.code);
  }
  assert.equal(M.http.getAccessToken(), null);
});

test("resendRegistrationOtp posts the token; cooldown answer carries retry_after", async () => {
  const store = newStore();
  const pending = { portal: "buyer", email: "a@x.test", registrationToken: TOKEN };
  routes["POST /api/auth/register/resend"] = () => json(200, { success: true, resend_after: 60 });
  assert.deepEqual(await store.resendRegistrationOtp(pending), { ok: true, resendAfter: 60, message: "" });
  assert.deepEqual(bodyOf(calls[0]), { portal: "buyer", email: "a@x.test", registration_token: TOKEN });
  routes["POST /api/auth/register/resend"] = () => json(429, { code: "RESEND_COOLDOWN", retry_after: 42 });
  const r = await store.resendRegistrationOtp(pending);
  assert.deepEqual([r.ok, r.retryAfter], [false, 42]);
});

test("OTP screen renders: email, 6-digit input, Verify OTP, Resend (with countdown), back to sign-in", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const { MemoryRouter } = require("react-router-dom");
  const h = React.createElement;
  const html = renderToString(h(MemoryRouter, null, h(M.AuthProvider, null,
    h(M.RegistrationOtpPanel, { pending: { portal: "buyer", email: "a@x.test", registrationToken: TOKEN, otpExpiresIn: 600, resendAfter: 60 } }))));
  assert.ok(html.includes("Verify your email"));
  assert.ok(html.includes("a@x.test"));
  assert.match(html, /id="reg-otp"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*id="reg-otp"/);
  assert.match(html, /maxLength="6"/);
  assert.match(html, /autoComplete="one-time-code"/);
  assert.ok(html.includes("Verify OTP"));
  assert.ok(html.includes("Resend OTP in <!-- -->60<!-- -->s") || html.includes("Resend OTP in 60s"));
  assert.ok(html.includes("Back to sign in"));
  assert.ok(html.includes("10<!-- --> minutes") || html.includes("10 minutes"));
  assert.ok(!html.includes(TOKEN), "token never rendered");
});

test("buyer + seller pages switch to the OTP screen after register (no auto-login before OTP); theme preserved", () => {
  for (const [f, theme] of [["src/components/Buyer/BuyerAuthPage.jsx", "gold"], ["src/components/Seller/SellerAuthPage.jsx", "indigo"]]) {
    const src = read(f);
    assert.match(src, /import RegistrationOtpPanel from '\.\.\/Auth\/RegistrationOtpPanel'/, f);
    assert.match(src, /if \(result\.pending\) \{[\s\S]*?setPending\(result\.pending\);[\s\S]*?return;/, f);
    assert.match(src, new RegExp(`theme="${theme}"`), f);
    assert.match(src, /onVerified=\{\(u\) => onLogin\?\.\(u\)\}/, f);
    assert.match(src, /setForm\(f => \(\{ \.\.\.f, password: '' \}\)\)/, `${f} clears the password once the code is sent`);
  }
  const panel = stripComments(read("src/components/Auth/RegistrationOtpPanel.jsx"));
  assert.ok(!/localStorage|sessionStorage/.test(panel), "OTP screen never stores anything");
  assert.ok(!/console\./.test(panel));
});
