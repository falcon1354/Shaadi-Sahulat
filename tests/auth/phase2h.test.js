/**
 * Phase 2H — password reset + email verification.
 * Run: npm run test:auth
 *
 * Isolated: Buyer/Admin/sellers/auth_sessions are in-memory fakes (with $gt and
 * dotted-path support so the atomic one-time-token consumes are exercised), email
 * goes to an in-memory transport (mailer.setMailTransport) and Socket.IO is a REAL
 * server on the same HTTP server as the API. No database, no SMTP, no .eml files.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.REFRESH_TTL_DAYS = "7";
process.env.REFRESH_ABSOLUTE_DAYS = "30";
process.env.BCRYPT_ROUNDS = "10";
process.env.EMAIL_TRANSPORT = "disabled"; // belt and braces: the injected transport is used
process.env.EMAIL_VERIFICATION_REQUIRED = "false";
process.env.PASSWORD_RESET_TTL_MINUTES = "30";
process.env.EMAIL_VERIFY_TTL_HOURS = "24";
process.env.AUTH_LEGACY_HEADERS = "false";
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

const tokens = require("../../lib/tokens");
const mailer = require("../../lib/mailer");
const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const AuthSession = require("../../models/AuthSession");

// ── In-memory fakes (dotted paths, null, $gt) ───────────────────────────────

const db = { buyers: [], admins: [], sellers: [], sessions: [] };
let seq = 1;
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ?? (c[k] = {}); c[ks.at(-1)] = v; }
function unsetPath(o, p) { const ks = p.split("."); const parent = ks.length === 1 ? o : getPath(o, ks.slice(0, -1).join(".")); if (parent) delete parent[ks.at(-1)]; }
function applyUpdate(doc, u) {
  for (const [p, v] of Object.entries(u.$set || {})) setPath(doc, p, v);
  for (const [p, v] of Object.entries(u.$inc || {})) setPath(doc, p, (getPath(doc, p) || 0) + v);
  for (const p of Object.keys(u.$unset || {})) unsetPath(doc, p);
}
function matches(doc, f) {
  return Object.entries(f).every(([k, v]) => {
    const actual = getPath(doc, k);
    if (v === null) return actual == null;
    if (v && typeof v === "object" && !(v instanceof Date) && "$gt" in v) {
      return actual != null && new Date(actual).getTime() > new Date(v.$gt).getTime();
    }
    return actual !== undefined && String(actual) === String(v);
  });
}
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });
function fakeModel(Model, key) {
  Model.findOne = (f) => chain(() => db[key].find((d) => matches(d, f)));
  Model.updateOne = async (f, u) => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); };
  Model.findOneAndUpdate = (f, u) => chain(() => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); return d; });
}
fakeModel(Buyer, "buyers");
fakeModel(Admin, "admins");
Buyer.create = async (data) => {
  const doc = new Buyer(data);
  const err = doc.validateSync();
  if (err) throw err;
  if (db.buyers.some((b) => b.email === data.email)) throw Object.assign(new Error("dup"), { code: 11000 });
  db.buyers.push(clone(doc.toObject()));
  return doc;
};
mongoose.connection.collection = () => ({
  findOne: async (f, o) => { const d = clone(db.sellers.find((x) => matches(x, f))); if (d && o?.projection?.password_hash === 0) delete d.password_hash; return d; },
  updateOne: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); },
  findOneAndUpdate: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return clone(d); },
});
AuthSession.create = async (data) => { const d = { _id: String(seq++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data }; db.sessions.push(d); return { ...d }; };
AuthSession.findOne = async (f) => clone(db.sessions.find((d) => matches(d, f)));
AuthSession.findOneAndUpdate = async (f, u) => { const d = db.sessions.find((x) => matches(x, f)); if (!d) return null; applyUpdate(d, u); return clone(d); };
AuthSession.updateMany = async (f, u) => { for (const d of db.sessions.filter((x) => matches(x, f))) applyUpdate(d, u); };

// ── Mail + log capture ──────────────────────────────────────────────────────

const mails = [];
mailer.setMailTransport(async (m) => { mails.push(m); });
const logs = [];
for (const level of ["log", "info", "warn", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { logs.push(args.map(String).join(" ")); orig(...args); };
}

// Dummy test passwords (not real credentials).
const PW = "Old-Passw0rd!";
const NEW_PW = "N3w-Passw0rd!";
const BC = bcrypt.hashSync(PW, 10);

function seed() {
  mails.length = 0;
  db.sessions = [];
  const buyer = (id, email, auth) => ({ buyer_id: id, name: `Buyer ${id}`, email, password_hash: BC, ...(auth ? { auth } : {}) });
  db.buyers = [
    buyer("buyer_1", "b1@x.test", { token_version: 0, email_verified: true }),
    buyer("buyer_legacy", "legacy@x.test"),                                     // pre-2A record, no auth sub-doc
    buyer("buyer_unv", "unv@x.test", { token_version: 0, email_verified: false }),
    buyer("buyer_dis", "dis@x.test", { login_disabled: true }),
    buyer("buyer_lock", "lock@x.test", { failed_logins: 3, lock_until: new Date(Date.now() + 10 * 60 * 1000) }),
    buyer("buyer_sock", "sock@x.test", { token_version: 2 }),
    buyer("buyer_race", "race@x.test"),
    buyer("buyer_rl", "rl@x.test"),
  ];
  db.admins = [{ admin_id: "admin_001", name: "Admin", email: "admin@x.test", password_hash: BC }];
  db.sellers = [
    { seller_id: "sel_1", name: "Seller One", email: "s1@x.test", password_hash: BC, auth: { token_version: 0, email_verified: false } },
    { seller_id: "sel_demo", name: "Demo", email: "admin@x.test", password_hash: BC },          // shares the admin email
    { seller_id: "SELLER_SYS", name: "System", email: "system@x.test" },                           // no password
  ];
}
seed();

// ── App: API + real Socket.IO on one HTTP server ────────────────────────────

// OTP-first registration keeps pending sign-ups in PendingRegistration (in memory here).
const pendingRegs = require("./_registrationFakes").installPendingFake();

const authRoutes = require("../../routes/auth");
const socketLib = require("../../lib/socket");

const app = express();
app.set("trust proxy", "loopback"); // lets each test use its own client IP (X-Forwarded-For) for rate limits
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
const server = http.createServer(app);
socketLib.initSocket(server);

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  mailer.setMailTransport(null);
  socketLib.getIO().close();
  await new Promise((r) => server.close(r));
});
test.beforeEach(() => { seed(); process.env.EMAIL_VERIFICATION_REQUIRED = "false"; });

// ── Helpers ─────────────────────────────────────────────────────────────────

let ipSeq = 1;
const freshIp = () => `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const CSRF = { "Content-Type": "application/json", "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
const post = (p, body, { ip = freshIp(), headers = {} } = {}) =>
  fetch(`${base}/api/auth${p}`, { method: "POST", headers: { ...CSRF, "X-Forwarded-For": ip, ...headers }, body: JSON.stringify(body) });
const json = async (res) => ({ status: res.status, body: await res.json(), res });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 3000) {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error("timeout"); await sleep(10); }
}
/** forgot-password answers before the background work finishes — let it settle. */
const settle = () => sleep(150);
const tokenIn = (mail, path) => {
  const m = mail.text.match(new RegExp(`http://localhost:3000${path}\\?token=([A-Za-z0-9_-]{43})`));
  assert.ok(m, `link to ${path} in email`);
  return m[1];
};
const buyer = (id) => db.buyers.find((b) => b.buyer_id === id);
const seller = (id) => db.sellers.find((s) => s.seller_id === id);
const cookieOf = (res) => (res.headers.getSetCookie().find((c) => c.startsWith("ss_rt=")) || "");
async function requestReset(email) {
  const before = mails.length;
  const r = await json(await post("/forgot-password", { email }));
  await settle();
  return { ...r, mail: mails.length > before ? mails.at(-1) : null };
}
async function resetToken(email) {
  const { mail } = await requestReset(email);
  assert.ok(mail, "reset email sent");
  return tokenIn(mail, "/reset-password");
}
const login = (email, password, portal = "buyer") => post("/login", { portal, email, password });
const everythingStored = () => JSON.stringify(db, (k, v) => (v instanceof Date ? v.toISOString() : v));
const GENERIC = "If an account exists for this email, you will receive password reset instructions.";

// ── Forgot password ─────────────────────────────────────────────────────────

test("1. forgot-password (existing buyer): generic 200, email with FRONTEND_ORIGIN link, token hashed + expiring", async () => {
  const { status, body, mail } = await requestReset("B1@X.test ");
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, message: GENERIC });
  assert.equal(mail.to, "b1@x.test");
  const raw = tokenIn(mail, "/reset-password");
  const a = buyer("buyer_1").auth;
  assert.equal(a.reset_token_hash, tokens.hashOneTimeToken("reset", raw));
  assert.notEqual(a.reset_token_hash, raw);
  const ttl = new Date(a.reset_expires).getTime() - Date.now();
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000, "expires in ~30 minutes");
});

test("2. forgot-password (unknown email): identical status + body, no email", async () => {
  const known = await requestReset("b1@x.test");
  const unknown = await requestReset("nobody@x.test");
  assert.equal(unknown.status, known.status);
  assert.deepEqual(unknown.body, known.body);
  assert.equal(unknown.mail, null);
});

test("3. forgot-password (malformed / missing / non-string email): same generic answer, no email", async () => {
  for (const email of ["not-an-email", "", undefined, { $gt: "" }, ["b1@x.test"], "a".repeat(300) + "@x.test"]) {
    const r = await requestReset(email);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, message: GENERIC });
    assert.equal(r.mail, null);
  }
});

test("4. forgot-password: disabled account, password-less system seller and admin-email seller get no email", async () => {
  for (const email of ["dis@x.test", "system@x.test"]) {
    const r = await requestReset(email);
    assert.deepEqual(r.body, { success: true, message: GENERIC });
    assert.equal(r.mail, null, email);
  }
  assert.equal(seller("sel_demo").auth, undefined, "demo seller sharing the admin email is never touched");
});

test("5. forgot-password (admin): supported with the same protections; admin record gets the token", async () => {
  const { body, mail } = await requestReset("admin@x.test");
  assert.deepEqual(body, { success: true, message: GENERIC });
  const raw = tokenIn(mail, "/reset-password");
  assert.equal(db.admins[0].auth.reset_token_hash, tokens.hashOneTimeToken("reset", raw));
  assert.equal(seller("sel_demo").auth, undefined);
});

test("6. raw tokens never appear in responses, logs or the database", async () => {
  logs.length = 0;
  const { res, mail } = await requestReset("b1@x.test");
  const raw = tokenIn(mail, "/reset-password");
  assert.ok(!JSON.stringify(res.headers.raw?.() || [...res.headers]).includes(raw));
  assert.ok(!logs.some((l) => l.includes(raw)), "token not logged");
  assert.ok(!everythingStored().includes(raw), "token not stored");
  const r = await json(await post("/reset-password", { token: raw, password: NEW_PW }));
  assert.ok(!JSON.stringify(r.body).includes(raw));
  assert.ok(!logs.some((l) => l.includes(raw) || l.includes(NEW_PW)), "token/password not logged");
});

test("7. email content: only the one-time link — no password, hash, ids or JWT", async () => {
  buyer("buyer_1").name = "Aisha <b>Khan</b>"; // display name must not contain the id (and is HTML-escaped)
  const { mail } = await requestReset("b1@x.test");
  const all = `${mail.subject}\n${mail.text}\n${mail.html}`;
  assert.ok(!all.includes("$2"), "no bcrypt hash");
  assert.ok(!all.includes(buyer("buyer_1").auth.reset_token_hash), "no token hash");
  assert.ok(!all.includes("buyer_1"), "no account id");
  assert.ok(!/eyJ[A-Za-z0-9_-]+\./.test(all), "no JWT");
  assert.ok(mail.html.includes("http://localhost:3000/reset-password?token="));
  assert.ok(!mail.html.includes("<b>Khan</b>") && mail.html.includes("&lt;b&gt;Khan"), "name escaped in HTML");
});

test("8. new request replaces the old token (after the 60 s cooldown); within cooldown no second email", async () => {
  const first = await resetToken("b1@x.test");
  const again = await requestReset("b1@x.test");
  assert.equal(again.mail, null, "cooldown suppresses a second email");
  assert.deepEqual(again.body, { success: true, message: GENERIC });
  buyer("buyer_1").auth.reset_requested_at = new Date(Date.now() - 61 * 1000);
  const second = await resetToken("b1@x.test");
  assert.notEqual(second, first);
  const old = await json(await post("/reset-password", { token: first, password: NEW_PW }));
  assert.equal(old.status, 400);
  assert.equal(old.body.code, "INVALID_OR_EXPIRED_TOKEN");
  const ok = await json(await post("/reset-password", { token: second, password: NEW_PW }));
  assert.equal(ok.status, 200);
});

// ── Reset password ──────────────────────────────────────────────────────────

test("9. reset: bcrypt hash, token_version++, token cleared, new password works, old fails", async () => {
  const raw = await resetToken("b1@x.test");
  const r = await json(await post("/reset-password", { token: raw, password: NEW_PW }));
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  const b = buyer("buyer_1");
  assert.match(b.password_hash, /^\$2[aby]\$/);
  assert.ok(bcrypt.compareSync(NEW_PW, b.password_hash));
  assert.equal(b.auth.token_version, 1);
  assert.equal(b.auth.reset_token_hash, undefined);
  assert.equal(b.auth.reset_expires, undefined);
  assert.ok(b.auth.password_changed_at);
  assert.equal((await login("b1@x.test", PW)).status, 401);
  assert.equal((await login("b1@x.test", NEW_PW)).status, 200);
});

test("10. reset does NOT auto-login: no access token, refresh cookie cleared", async () => {
  const raw = await resetToken("b1@x.test");
  const r = await json(await post("/reset-password", { token: raw, password: NEW_PW }));
  assert.equal(r.body.access_token, undefined);
  assert.equal(r.body.user, undefined);
  const c = cookieOf(r.res);
  assert.ok(c.startsWith("ss_rt=;") || /Expires=Thu, 01 Jan 1970/.test(c), "refresh cookie cleared");
  assert.equal(db.sessions.filter((s) => s.user_id === "buyer_1").length, 0, "no session created");
});

test("11. reset revokes every refresh session and invalidates existing access tokens", async () => {
  const l1 = await json(await login("b1@x.test", PW));
  const l2 = await json(await login("b1@x.test", PW));
  const raw = await resetToken("b1@x.test");
  await post("/reset-password", { token: raw, password: NEW_PW });
  assert.ok(db.sessions.filter((s) => s.user_id === "buyer_1").every((s) => s.revoked_at && s.revoke_reason === "password_reset"));
  for (const l of [l1, l2]) {
    const refresh = await post("/refresh", {}, { headers: { Cookie: cookieOf(l.res).split(";")[0] } });
    assert.equal(refresh.status, 401, "old refresh token rejected");
    const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${l.body.access_token}` } });
    assert.equal(me.status, 401, "old access token rejected");
  }
});

test("12. token is single-use", async () => {
  const raw = await resetToken("b1@x.test");
  assert.equal((await post("/reset-password", { token: raw, password: NEW_PW })).status, 200);
  const again = await json(await post("/reset-password", { token: raw, password: "An0ther-Passw0rd" }));
  assert.equal(again.status, 400);
  assert.equal(again.body.code, "INVALID_OR_EXPIRED_TOKEN");
  assert.ok(bcrypt.compareSync(NEW_PW, buyer("buyer_1").password_hash));
});

test("13. expired token → 400 TOKEN_EXPIRED, password unchanged", async () => {
  const raw = await resetToken("b1@x.test");
  buyer("buyer_1").auth.reset_expires = new Date(Date.now() - 1000);
  const r = await json(await post("/reset-password", { token: raw, password: NEW_PW }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "TOKEN_EXPIRED");
  assert.equal(buyer("buyer_1").password_hash, BC);
  assert.equal(buyer("buyer_1").auth.token_version, 0);
});

test("14. invalid / malformed / missing / non-string tokens → 400 without touching accounts", async () => {
  const bad = [undefined, "", "short", "x".repeat(43), "!".repeat(43), crypto.randomBytes(32).toString("base64url"),
    { $ne: null }, ["a"], 12345, "a".repeat(10000)];
  for (const token of bad) {
    const r = await json(await post("/reset-password", { token, password: NEW_PW }));
    assert.equal(r.status, 400, JSON.stringify(token)?.slice(0, 30));
    assert.equal(r.body.code, "INVALID_OR_EXPIRED_TOKEN");
  }
  assert.ok(db.buyers.every((b) => b.password_hash === BC));
});

test("15. weak password → 400 VALIDATION_ERROR and the token stays usable", async () => {
  const raw = await resetToken("b1@x.test");
  for (const password of ["short1", "nodigitshere", "12345678", "b1@x.test", undefined, "a1".repeat(40)]) {
    const r = await json(await post("/reset-password", { token: raw, password }));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "VALIDATION_ERROR");
  }
  assert.equal(buyer("buyer_1").password_hash, BC);
  assert.equal((await post("/reset-password", { token: raw, password: NEW_PW })).status, 200);
});

test("16. purpose binding: a verification token cannot reset a password (and vice versa)", async () => {
  await post("/resend-verification", { email: "unv@x.test" });
  await waitFor(() => mails.length === 1);
  const verifyRaw = tokenIn(mails[0], "/verify-email");
  const r = await json(await post("/reset-password", { token: verifyRaw, password: NEW_PW }));
  assert.equal(r.status, 400);
  assert.equal(buyer("buyer_unv").password_hash, BC);

  const resetRaw = await resetToken("b1@x.test");
  const v = await json(await post("/verify-email", { token: resetRaw }));
  assert.equal(v.status, 400);
  assert.equal(v.body.code, "INVALID_OR_EXPIRED_TOKEN");
});

test("17. concurrent use of one token: exactly one reset succeeds", async () => {
  const raw = await resetToken("race@x.test");
  const results = await Promise.all([1, 2, 3, 4].map((i) => post("/reset-password", { token: raw, password: `Race-Passw0rd${i}` })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400, 400]);
  assert.equal(buyer("buyer_race").auth.token_version, 1);
});

test("18. reset clears an active lockout and failed-login counter", async () => {
  const raw = await resetToken("lock@x.test");
  await post("/reset-password", { token: raw, password: NEW_PW });
  const a = buyer("buyer_lock").auth;
  assert.equal(a.lock_until, undefined);
  assert.equal(a.failed_logins, 0);
  assert.equal((await login("lock@x.test", NEW_PW)).status, 200);
});

test("19. seller and admin resets work in their own stores (portal login with the new password)", async () => {
  const s = await resetToken("s1@x.test");
  assert.equal((await post("/reset-password", { token: s, password: NEW_PW })).status, 200);
  assert.ok(bcrypt.compareSync(NEW_PW, seller("sel_1").password_hash));
  assert.equal(seller("sel_1").auth.token_version, 1);
  assert.equal((await login("s1@x.test", NEW_PW, "seller")).status, 200);

  const a = await resetToken("admin@x.test");
  assert.equal((await post("/reset-password", { token: a, password: NEW_PW })).status, 200);
  assert.equal((await login("admin@x.test", NEW_PW, "admin")).status, 200);
  assert.equal(seller("sel_demo").password_hash, BC, "demo seller untouched");
});

test("20. a token issued before an account was disabled cannot be used", async () => {
  const raw = await resetToken("b1@x.test");
  buyer("buyer_1").auth.login_disabled = true;
  const r = await json(await post("/reset-password", { token: raw, password: NEW_PW }));
  assert.equal(r.status, 400);
  assert.equal(buyer("buyer_1").password_hash, BC);
});

test("21. forgot-password rate limit per IP+email → 429 (same for unknown emails)", async () => {
  const ip = freshIp();
  for (const email of ["rl@x.test", "ghost-rl@x.test"]) {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await post("/forgot-password", { email }, { ip })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429], email);
  }
  await settle();
});

test("22. reset-password rate limit per IP → 429", async () => {
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await post("/reset-password", { token: "x", password: NEW_PW }, { ip })).status);
  assert.equal(codes.filter((c) => c === 400).length, 20);
  assert.equal(codes.at(-1), 429);
});

test("23. CSRF: forgot/reset/verify/resend require the header and an allowed Origin", async () => {
  for (const p of ["/forgot-password", "/reset-password", "/verify-email", "/resend-verification"]) {
    const noHeader = await fetch(`${base}/api/auth${p}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": freshIp() }, body: "{}" });
    assert.equal(noHeader.status, 403, p);
    const evil = await post(p, {}, { headers: { Origin: "https://evil.example" } });
    assert.equal(evil.status, 403, p);
  }
});

// ── Email verification ──────────────────────────────────────────────────────

test("24. registration is OTP-first: accounts are created already verified (no post-signup verification link)", async () => {
  pendingRegs.length = 0;
  const r = await json(await post("/buyer/register", { name: "New Buyer", email: "new@x.test", password: PW }));
  assert.equal(r.status, 202);
  assert.equal(db.buyers.find((x) => x.email === "new@x.test"), undefined, "no account before the OTP");
  await waitFor(() => mails.length === 1);
  assert.match(mails[0].subject, /Verify your email/);
  assert.ok(!/verify-email\?token=/.test(mails[0].text), "a code, not a link");
  const otp = mails[0].text.match(/\b(\d{6})\b/)[1];
  assert.ok(!everythingStored().includes(otp) && !JSON.stringify(pendingRegs).includes(otp), "OTP never stored in plaintext");
  const v = await json(await post("/register/verify", { portal: "buyer", email: "new@x.test", otp, registration_token: r.body.registration_token }));
  assert.equal(v.status, 201);
  assert.equal(v.body.user.email_verified, true);
  const b = db.buyers.find((x) => x.email === "new@x.test");
  assert.equal(b.auth.email_verified, true);
  assert.equal(b.auth.verify_token_hash, undefined);
  await settle();
  assert.equal(mails.length, 1, "no verification-link email after sign-up");
});

test("25. verify-email (valid, pre-OTP account): marks verified, clears the token; /me reports email_verified", async () => {
  const session = await json(await login("unv@x.test", PW));
  assert.equal(session.body.user.email_verified, false);
  await post("/resend-verification", { email: "unv@x.test" });
  await waitFor(() => mails.length === 1);
  const raw = tokenIn(mails[0], "/verify-email");
  const r = await json(await post("/verify-email", { token: raw }));
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "verified");
  const b = buyer("buyer_unv");
  assert.equal(b.auth.email_verified, true);
  assert.ok(b.auth.email_verified_at);
  assert.equal(b.auth.verify_token_hash, undefined);
  const me = await (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${session.body.access_token}` } })).json();
  assert.equal(me.user.email_verified, true);
  assert.ok(!JSON.stringify(me).includes("verify_"), "no token fields in /me");
});

test("26. verify-email reuse → already_verified (grants nothing new)", async () => {
  await post("/resend-verification", { email: "unv@x.test" });
  await waitFor(() => mails.length === 1);
  const raw = tokenIn(mails[0], "/verify-email");
  assert.equal((await json(await post("/verify-email", { token: raw }))).body.status, "verified");
  const again = await json(await post("/verify-email", { token: raw }));
  assert.equal(again.status, 200);
  assert.equal(again.body.status, "already_verified");
  assert.equal(buyer("buyer_unv").auth.verify_token_hash, undefined);
});

test("27. verify-email expired → 400 TOKEN_EXPIRED, still unverified", async () => {
  await post("/resend-verification", { email: "unv@x.test" });
  await waitFor(() => mails.length === 1);
  const raw = tokenIn(mails[0], "/verify-email");
  buyer("buyer_unv").auth.verify_expires = new Date(Date.now() - 1000);
  const r = await json(await post("/verify-email", { token: raw }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "TOKEN_EXPIRED");
  assert.equal(buyer("buyer_unv").auth.email_verified, false);
});

test("28. verify-email invalid / malformed → 400 INVALID_OR_EXPIRED_TOKEN", async () => {
  for (const token of [undefined, "", "abc", crypto.randomBytes(32).toString("base64url"), { $exists: true }]) {
    const r = await json(await post("/verify-email", { token }));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "INVALID_OR_EXPIRED_TOKEN");
  }
});

test("29. resend by email (unverified seller): new link replaces the old one", async () => {
  await post("/resend-verification", { email: "s1@x.test" });
  await waitFor(() => mails.length === 1);
  const first = tokenIn(mails[0], "/verify-email");
  seller("sel_1").auth.verify_sent_at = new Date(Date.now() - 61 * 1000);
  await post("/resend-verification", { email: "s1@x.test" });
  await waitFor(() => mails.length === 2);
  const second = tokenIn(mails[1], "/verify-email");
  assert.notEqual(first, second);
  assert.equal((await post("/verify-email", { token: first })).status, 400, "old link no longer works");
  assert.equal((await json(await post("/verify-email", { token: second }))).body.status, "verified");
  assert.equal(seller("sel_1").auth.email_verified, true);
});

test("30. resend: verified, legacy, unknown, disabled, admin and admin-email seller → generic answer, no email", async () => {
  for (const email of ["b1@x.test", "legacy@x.test", "nobody@x.test", "dis@x.test", "admin@x.test", "system@x.test"]) {
    const r = await json(await post("/resend-verification", { email }));
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  }
  await settle();
  assert.equal(mails.length, 0);
});

test("31. resend with Bearer targets only the signed-in account (body email ignored)", async () => {
  const l = await json(await login("unv@x.test", PW));
  assert.equal(l.status, 200, "unverified login allowed (policy off)");
  assert.equal(l.body.user.email_verified, false);
  await post("/resend-verification", { email: "s1@x.test" }, { headers: { Authorization: `Bearer ${l.body.access_token}` } });
  await waitFor(() => mails.length === 1);
  await settle();
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "unv@x.test");
  assert.equal(seller("sel_1").auth.verify_token_hash, undefined);
  const bad = await post("/resend-verification", {}, { headers: { Authorization: "Bearer not-a-jwt" } });
  assert.equal(bad.status, 401, "an invalid Bearer is rejected, not treated as anonymous");
});

test("32. resend cooldown + per-account rate limit", async () => {
  await post("/resend-verification", { email: "unv@x.test" });
  await post("/resend-verification", { email: "unv@x.test" });
  await settle();
  assert.equal(mails.length, 1, "second request inside the cooldown sends nothing");
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post("/resend-verification", { email: "ghost@x.test" }, { ip })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

test("33. admins: no verification flow, no public admin signup/password creation", async () => {
  db.admins[0].auth = { verify_token_hash: tokens.hashOneTimeToken("verify", "A".repeat(43)), verify_expires: new Date(Date.now() + 3600e3) };
  const r = await json(await post("/verify-email", { token: "A".repeat(43) }));
  assert.equal(r.status, 400, "verify-email never matches admin records");
  for (const p of ["/admin/register", "/admin/signup", "/admin/verify-email", "/admin/set-password"]) {
    assert.equal((await post(p, { email: "evil@x.test", password: PW })).status, 404, p);
  }
});

test("34. login policy: unverified buyers/sellers may sign in by default; EMAIL_VERIFICATION_REQUIRED=true blocks them (not admins)", async () => {
  assert.equal((await login("unv@x.test", PW)).status, 200);
  process.env.EMAIL_VERIFICATION_REQUIRED = "true";
  const blocked = await json(await login("unv@x.test", PW));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
  assert.equal((await login("legacy@x.test", PW)).status, 200, "legacy accounts count as verified");
  assert.equal((await login("admin@x.test", PW, "admin")).status, 200, "admins unaffected");
  assert.equal((await login("unv@x.test", "Wrong-Passw0rd")).status, 401, "wrong password is still a plain 401");
});

test("35. completing a reset also verifies the email and retires any pending verification link", async () => {
  await post("/resend-verification", { email: "unv@x.test" });
  await waitFor(() => mails.length === 1);
  const verifyRaw = tokenIn(mails[0], "/verify-email");
  const raw = await resetToken("unv@x.test");
  await post("/reset-password", { token: raw, password: NEW_PW });
  const a = buyer("buyer_unv").auth;
  assert.equal(a.email_verified, true);
  assert.equal(a.verify_token_hash, undefined);
  assert.equal((await post("/verify-email", { token: verifyRaw })).status, 400);
});

// ── Socket regression ───────────────────────────────────────────────────────

test("socket: live socket is disconnected by a reset; old token/refresh fail; new login + socket work", async () => {
  const l = await json(await login("sock@x.test", PW));
  assert.equal(l.status, 200);
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = (token) => new Promise((resolve) => {
    const c = ioClient(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    c.on("connect", () => resolve({ c, ok: true }));
    c.on("connect_error", (e) => resolve({ c, ok: false, err: e.message }));
  });

  const live = await connect(l.body.access_token);
  assert.equal(live.ok, true);
  let dropped = false;
  live.c.on("disconnect", () => { dropped = true; });

  const raw = await resetToken("sock@x.test");
  assert.equal((await post("/reset-password", { token: raw, password: NEW_PW })).status, 200);
  await waitFor(() => dropped, 2000);
  assert.equal(live.c.connected, false, "socket disconnected by the reset");

  const stale = await connect(l.body.access_token);
  assert.equal(stale.ok, false, "old access token rejected by the socket server");
  stale.c.close();
  assert.equal((await post("/refresh", {}, { headers: { Cookie: cookieOf(l.res).split(";")[0] } })).status, 401);

  const fresh = await json(await login("sock@x.test", NEW_PW));
  assert.equal(fresh.status, 200);
  assert.equal(tokens.verifyAccessToken(fresh.body.access_token).tv, 3);
  const again = await connect(fresh.body.access_token);
  assert.equal(again.ok, true, "new login connects");
  again.c.close();
  live.c.close();
});
