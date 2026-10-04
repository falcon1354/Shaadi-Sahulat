/**
 * Phase 2B — buyer registration + login tests.
 * Run: npm run test:auth
 *
 * Isolated: Buyer/Admin/sellers/auth_sessions are in-memory fakes (no MongoDB).
 * Buyer.create still validates against the real Mongoose schema.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.REFRESH_TTL_DAYS = "7";
process.env.REFRESH_ABSOLUTE_DAYS = "30";
process.env.BCRYPT_ROUNDS = "10";
process.env.EMAIL_TRANSPORT = "disabled"; // tests never send/write email
process.env.AUTH_LEGACY_HEADERS = "true";
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const tokens = require("../../lib/tokens");
const passwords = require("../../lib/passwords");
const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const AuthSession = require("../../models/AuthSession");

// ── In-memory fakes ─────────────────────────────────────────────────────────

const db = { buyers: [], admins: [], sellers: [], sessions: [] };
let seq = 1;

const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split(".");
  let cur = o;
  for (const k of ks.slice(0, -1)) cur = cur[k] ?? (cur[k] = {});
  cur[ks.at(-1)] = v;
}
function unsetPath(o, p) {
  const ks = p.split(".");
  const parent = getPath(o, ks.slice(0, -1).join(".")) ?? (ks.length === 1 ? o : undefined);
  if (parent) delete parent[ks.at(-1)];
}
function applyUpdate(doc, u) {
  for (const [p, v] of Object.entries(u.$set || {})) setPath(doc, p, v);
  for (const [p, v] of Object.entries(u.$inc || {})) setPath(doc, p, (getPath(doc, p) || 0) + v);
  for (const p of Object.keys(u.$unset || {})) unsetPath(doc, p);
}
const matches = (doc, f) => Object.entries(f).every(([k, v]) =>
  v === null ? doc[k] == null : String(doc[k]) === String(v));
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });

Buyer.findOne = (f) => chain(() => db.buyers.find((d) => matches(d, f)));
Buyer.findOneAndUpdate = (f, u) => chain(() => {
  const d = db.buyers.find((x) => matches(x, f));
  if (d) applyUpdate(d, u);
  return d;
});
Buyer.updateOne = async (f, u) => {
  const d = db.buyers.find((x) => matches(x, f));
  if (d) applyUpdate(d, u);
};
Buyer.create = async (data) => {
  const doc = new Buyer(data);
  const err = doc.validateSync();
  if (err) throw err;
  if (db.buyers.some((b) => b.email === data.email)) throw Object.assign(new Error("dup"), { code: 11000 });
  const plain = doc.toObject();
  db.buyers.push(clone(plain));
  return doc;
};
Admin.findOne = (f) => chain(() => db.admins.find((d) => matches(d, f)));
mongoose.connection.collection = () => ({
  findOne: async (f) => clone(db.sellers.find((d) => matches(d, f))),
  updateOne: async () => {},
});

AuthSession.create = async (data) => {
  const d = { _id: String(seq++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data };
  db.sessions.push(d);
  return { ...d };
};
AuthSession.findOne = async (f) => clone(db.sessions.find((d) => matches(d, f)));
AuthSession.findOneAndUpdate = async (f, u) => {
  const d = db.sessions.find((x) => matches(x, f));
  if (!d) return null;
  applyUpdate(d, u);
  return clone(d);
};
AuthSession.updateMany = async (f, u) => {
  for (const d of db.sessions.filter((x) => matches(x, f))) applyUpdate(d, u);
};

let dummyCalls = 0;
const realDummy = passwords.dummyVerify;
passwords.dummyVerify = async (p) => { dummyCalls++; return realDummy(p); };

const PW = "Str0ng-Passw0rd";
const HASH10 = bcrypt.hashSync(PW, 10);
const HASH4 = bcrypt.hashSync(PW, 4);

function reset() {
  dummyCalls = 0;
  db.sessions = [];
  db.admins = [{ admin_id: "admin_001", name: "Admin", email: "admin@shaadisahulat.com", password_hash: HASH10 }];
  db.sellers = [
    { seller_id: "sel_8adb42bba8a7", name: "Demo", email: "admin@shaadisahulat.com" },
    { seller_id: "sel_x", name: "Seller", email: "seller@example.com" },
  ];
  db.buyers = [
    { buyer_id: "buyer_existing000001", name: "Aisha", email: "aisha@example.com", password_hash: HASH10,
      auth: { email_verified: true, token_version: 0, failed_logins: 0 } },
    { buyer_id: "buyer_legacy00000001", name: "Legacy", email: "legacy@example.com", password_hash: HASH4 }, // no auth subdoc
    { buyer_id: "buyer_versioned00001", name: "V", email: "v@example.com", password_hash: HASH10, auth: { token_version: 2 } },
    { buyer_id: "buyer_disabled000001", name: "D", email: "disabled@example.com", password_hash: HASH10, auth: { login_disabled: true } },
  ];
  for (let i = 1; i <= 6; i++) {
    db.buyers.push({ buyer_id: `buyer_lock${i}`, name: "L", email: `lock${i}@example.com`, password_hash: HASH10, auth: { failed_logins: 0 } });
  }
}
reset();

// OTP-first registration: pending records + emailed codes (in memory).
const { installPendingFake, captureMail } = require("./_registrationFakes");
const pending = installPendingFake();
const mail = captureMail();

const authRoutes = require("../../routes/auth");
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { reset(); pending.length = 0; mail.mails.length = 0; });

const CSRF = { "Content-Type": "application/json", "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
const post = (path, body, headers = CSRF) =>
  fetch(`${base}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const login = (email, password = PW, portal = "buyer") => post("/login", { portal, email, password });
const refreshCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith("ss_rt="));
const buyerBy = (email) => db.buyers.find((b) => b.email === email);
const NEW_BUYER = { name: "Sara Khan", email: "sara@example.com", password: PW, phone: "0300-1234567", city: "Lahore" };

// ── Registration (OTP-first: the account exists only after the emailed code is verified) ──

/** register → read the OTP from the captured email → verify. */
async function registerAndVerify(body, portal = "buyer") {
  const reg = await post(`/${portal}/register`, body);
  assert.equal(reg.status, 202, "register answers 202 verification_required");
  const r = await reg.json();
  await mail.settle();
  const otp = mail.otpFor(r.email);
  assert.match(otp, /^\d{6}$/);
  const res = await post("/register/verify", { portal, email: r.email, otp, registration_token: r.registration_token });
  return { reg: r, res, otp };
}

test("register: 202 verification_required, NO buyer yet; verify creates buyer_* with verified auth, session, cookie and JWT", async () => {
  const before = db.buyers.length;
  const reg = await post("/buyer/register", NEW_BUYER);
  assert.equal(reg.status, 202);
  const r = await reg.json();
  assert.equal(r.verification_required, true);
  assert.match(r.registration_token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(buyerBy("sara@example.com"), undefined, "no buyer before OTP verification");
  assert.equal(db.buyers.length, before);
  assert.equal(db.sessions.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].portal, "buyer");

  await mail.settle();
  const res = await post("/register/verify", { portal: "buyer", email: "sara@example.com", otp: mail.otpFor("sara@example.com"), registration_token: r.registration_token });
  assert.equal(res.status, 201);
  const body = await res.json();

  const stored = buyerBy("sara@example.com");
  assert.match(stored.buyer_id, /^buyer_[0-9a-f]{16}$/);
  assert.match(stored.password_hash, /^\$2[aby]\$10\$/);
  assert.ok(await bcrypt.compare(PW, stored.password_hash));
  assert.equal(stored.auth.email_verified, true);
  assert.equal(stored.auth.token_version, 0);
  assert.equal(stored.auth.failed_logins, 0);
  assert.ok(stored.auth.password_changed_at instanceof Date);
  assert.equal(pending.length, 0, "pending record removed");

  const p = tokens.verifyAccessToken(body.access_token);
  assert.deepEqual([p.sub, p.kind, p.tv], [stored.buyer_id, "buyer", 0]);
  assert.deepEqual(body.user, { role: "buyer", id: stored.buyer_id, name: "Sara Khan", email: "sara@example.com", email_verified: true });
  assert.equal(body.profile.city, "Lahore");

  const session = db.sessions.find((s) => s.session_id === p.sid);
  assert.ok(session && session.user_id === stored.buyer_id && session.user_kind === "buyer");
  const cookie = refreshCookie(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/auth/);
  assert.equal(session.token_hash, tokens.hashToken(cookie.split(";")[0].slice("ss_rt=".length)));
  assert.equal((await login("sara@example.com")).status, 200, "normal login works afterwards");
});

test("register: password_hash, OTP and auth are never returned", async () => {
  const reg = await post("/buyer/register", NEW_BUYER);
  const regText = await reg.text();
  await mail.settle();
  const otp = mail.otpFor("sara@example.com");
  assert.ok(!regText.includes(otp) && !regText.includes("password_hash") && !regText.includes("otp_hash"));
  const { registration_token } = JSON.parse(regText);
  const text = await (await post("/register/verify", { portal: "buyer", email: "sara@example.com", otp, registration_token })).text();
  assert.ok(!text.includes("password_hash"));
  assert.ok(!text.includes("$2a$") && !text.includes("$2b$"));
  assert.ok(!/"auth"\s*:/.test(text));
  assert.ok(!text.includes("token_version") && !text.includes("failed_logins"));
});

test("register: existing email (any role, normalized) → same 202 answer, no pending record, no OTP, no account", async () => {
  const fresh = await (await post("/buyer/register", { ...NEW_BUYER, email: "brand-new@example.com" })).json();
  for (const email of ["aisha@example.com", "  AISHA@Example.com ", "seller@example.com", "legacy@example.com"]) {
    mail.mails.length = 0;
    const res = await post("/buyer/register", { ...NEW_BUYER, email });
    assert.equal(res.status, 202, email);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), Object.keys(fresh).sort(), "identical response shape");
    assert.equal(body.verification_required, true);
    await mail.settle();
    assert.equal(mail.otpFor(body.email), null, "no OTP is sent for an existing account");
    assert.ok(mail.mails.some((m) => /already exists/i.test(m.text)), "an 'account already exists' notice is sent instead");
  }
  assert.equal(pending.filter((p) => p.normalized_email !== "brand-new@example.com").length, 0);
  assert.equal(db.buyers.filter((b) => b.email === "aisha@example.com").length, 1);
});

test("register: admin@shaadisahulat.com stays admin-only (no pending record, no role revealed)", async () => {
  const before = db.buyers.length;
  const res = await post("/buyer/register", { ...NEW_BUYER, email: "Admin@ShaadiSahulat.com" });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.ok(!/admin/i.test(body.message.replace(body.email, "")), "must not reveal which role owns the email");
  assert.equal(pending.length, 0);
  assert.equal(db.buyers.length, before);
  assert.equal(db.sessions.length, 0);
  // even a guessed code cannot create anything
  const v = await post("/register/verify", { portal: "buyer", email: "admin@shaadisahulat.com", otp: "123456", registration_token: body.registration_token });
  assert.equal(v.status, 400);
});

test("register: password policy and field validation rejected with 400, nothing created", async () => {
  const before = db.buyers.length;
  const cases = [
    { password: "short1" },
    { password: "allletters" },
    { password: "1234567890" },
    { password: "a1" + "é".repeat(36) },
    { email: "user1@example.com", password: "User1@Example.com" }, // equals email
    { email: "not-an-email" },
    { name: "" },
    { password: undefined },
    { city: 42 },
  ];
  for (const c of cases) {
    const res = await post("/buyer/register", { ...NEW_BUYER, ...c });
    assert.equal(res.status, 400, JSON.stringify(c));
    assert.equal((await res.json()).code, "VALIDATION_ERROR");
  }
  assert.equal(pending.length, 0);
  const { res } = await registerAndVerify({ ...NEW_BUYER, password: "Sara@example.com9", email: "sara@example.com" });
  assert.equal(res.status, 201);
  assert.equal(db.buyers.length, before + 1);
});

test("register: CSRF header and allowed Origin are required (register + verify + resend)", async () => {
  for (const p of ["/buyer/register", "/register/verify", "/register/resend"]) {
    assert.equal((await post(p, NEW_BUYER, { "Content-Type": "application/json" })).status, 403, p);
    assert.equal((await post(p, NEW_BUYER, { ...CSRF, Origin: "https://evil.example" })).status, 403, p);
  }
  assert.equal(buyerBy("sara@example.com"), undefined);
  assert.equal(pending.length, 0);
});

// ── Login ───────────────────────────────────────────────────────────────────

test("login: success returns JWT + refresh cookie + session, no secrets", async () => {
  const res = await login("  AISHA@example.com ");
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.ok(!text.includes("password_hash") && !/"auth"\s*:/.test(text));
  const p = tokens.verifyAccessToken(body.access_token);
  assert.deepEqual([p.sub, p.kind, p.tv], ["buyer_existing000001", "buyer", 0]);
  assert.equal(body.user.email, "aisha@example.com");
  assert.ok(refreshCookie(res));
  assert.equal(db.sessions.length, 1);
  assert.ok(buyerBy("aisha@example.com").auth.last_login_at instanceof Date);
});

test("login: refresh cookie from login works with /api/auth/refresh (Phase 2A rotation)", async () => {
  const res = await login("aisha@example.com");
  const cookie = refreshCookie(res).split(";")[0];
  const r = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...CSRF, Cookie: cookie } });
  assert.equal(r.status, 200);
  assert.equal(tokens.verifyAccessToken((await r.json()).access_token).sub, "buyer_existing000001");
  assert.equal(db.sessions.filter((s) => s.revoke_reason === "rotated").length, 1);
});

test("login: wrong password → generic 401 and failure counted", async () => {
  const res = await login("aisha@example.com", "Wrong-Passw0rd");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { success: false, code: "INVALID_CREDENTIALS", error: "Invalid email or password." });
  assert.equal(buyerBy("aisha@example.com").auth.failed_logins, 1);
  assert.equal(db.sessions.length, 0);
});

test("login: unknown email → identical response and dummy verification runs", async () => {
  const wrong = await (await login("aisha@example.com", "Wrong-Passw0rd")).json();
  dummyCalls = 0;
  const res = await login("nobody@example.com");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), wrong);
  assert.equal(dummyCalls, 1);
});

test("login: wrong/unsupported portal → identical generic 401", async () => {
  const wrong = await (await login("aisha@example.com", "Wrong-Passw0rd")).json();
  for (const [email, portal] of [["aisha@example.com", "seller"], ["legacy@example.com", "admin"],
    ["seller@example.com", "seller"], ["aisha@example.com", undefined], ["aisha@example.com", "superuser"]]) {
    dummyCalls = 0;
    const res = await post("/login", { portal, email, password: PW }); // portal sent as-is (may be absent)
    assert.equal(res.status, 401, `${email}/${portal}`);
    assert.deepEqual(await res.json(), wrong);
    assert.equal(dummyCalls, 1);
  }
  assert.equal(db.sessions.length, 0);
  // The admin email is not a buyer, so the buyer portal rejects it too.
  assert.equal((await login("admin@shaadisahulat.com")).status, 401);
});

test("login: 5 failed attempts lock the account for 15 minutes (correct password refused)", async () => {
  const email = "lock1@example.com";
  for (let i = 0; i < 5; i++) assert.equal((await login(email, "Wrong-Passw0rd")).status, 401);
  const b = buyerBy(email);
  const minutes = (new Date(b.auth.lock_until) - Date.now()) / 60000;
  assert.ok(minutes > 14.9 && minutes <= 15, `lock ≈ 15 min (got ${minutes})`);
  assert.equal(b.auth.failed_logins, 0);

  dummyCalls = 0;
  const locked = await login(email, PW);
  assert.equal(locked.status, 401);
  assert.equal((await locked.json()).code, "INVALID_CREDENTIALS");
  assert.equal(dummyCalls, 1, "locked accounts skip the real password check");
  assert.equal(db.sessions.length, 0);
});

test("login: lock expiration allows login again and clears the lock", async () => {
  const email = "lock2@example.com";
  for (let i = 0; i < 5; i++) await login(email, "Wrong-Passw0rd");
  buyerBy(email).auth.lock_until = new Date(Date.now() - 1000);
  const res = await login(email, PW);
  assert.equal(res.status, 200);
  const b = buyerBy(email);
  assert.equal(b.auth.lock_until, undefined);
  assert.equal(b.auth.failed_logins, 0);
});

test("login: after a lock expires, 5 new failures lock again", async () => {
  const email = "lock3@example.com";
  for (let i = 0; i < 5; i++) await login(email, "Wrong-Passw0rd");
  buyerBy(email).auth.lock_until = new Date(Date.now() - 1000);
  for (let i = 0; i < 4; i++) await login(email, "Wrong-Passw0rd");
  assert.ok(new Date(buyerBy(email).auth.lock_until) < new Date(), "not locked after 4");
  await login(email, "Wrong-Passw0rd");
  assert.ok(new Date(buyerBy(email).auth.lock_until) > new Date(), "locked after 5th");
});

test("login: success resets failed-login state", async () => {
  const email = "lock4@example.com";
  for (let i = 0; i < 3; i++) await login(email, "Wrong-Passw0rd");
  assert.equal(buyerBy(email).auth.failed_logins, 3);
  assert.equal((await login(email, PW)).status, 200);
  assert.equal(buyerBy(email).auth.failed_logins, 0);
  for (let i = 0; i < 4; i++) await login(email, "Wrong-Passw0rd");
  assert.equal(buyerBy(email).auth.lock_until, undefined, "counter restarted from zero");
});

test("login: disabled buyer → generic 401 even with the correct password", async () => {
  const wrong = await (await login("aisha@example.com", "Wrong-Passw0rd")).json();
  const res = await login("disabled@example.com", PW);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), wrong);
  assert.equal(db.sessions.length, 0);
});

test("login: legacy buyer without auth subdoc logs in (tv 0) and weak bcrypt is upgraded", async () => {
  const res = await login("legacy@example.com", PW);
  assert.equal(res.status, 200);
  assert.equal(tokens.verifyAccessToken((await res.json()).access_token).tv, 0);
  const b = buyerBy("legacy@example.com");
  assert.match(b.password_hash, /^\$2[aby]\$10\$/, "cost-4 hash upgraded to BCRYPT_ROUNDS");
  assert.ok(await bcrypt.compare(PW, b.password_hash));
  assert.equal(b.auth.email_verified, undefined, "legacy accounts are not marked unverified");
});

test("login: token_version is carried into the JWT and accepted by /me", async () => {
  const res = await login("v@example.com", PW);
  const { access_token } = await res.json();
  assert.equal(tokens.verifyAccessToken(access_token).tv, 2);
  const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${access_token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.id, "buyer_versioned00001");
});

test("login: CSRF header required", async () => {
  const res = await post("/login", { portal: "buyer", email: "aisha@example.com", password: PW }, { "Content-Type": "application/json" });
  assert.equal(res.status, 403);
  assert.equal(db.sessions.length, 0);
});

test("login: per IP+email rate limit → 429 for existing and unknown emails alike", async () => {
  for (const email of ["ratelimit-unknown@example.com", "lock5@example.com"]) {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await login(email, "Wrong-Passw0rd")).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401), email);
    assert.equal(statuses[10], 429, email);
  }
});
