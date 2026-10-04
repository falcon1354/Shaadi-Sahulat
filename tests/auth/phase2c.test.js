/**
 * Phase 2C — seller registration + login tests.
 * Run: npm run test:auth
 *
 * Isolated: Buyer/Admin/sellers/auth_sessions are in-memory fakes, and Flask is
 * replaced by a local HTTP stub so the internal Node → Flask request is observed.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
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
const http = require("node:http");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const axios = require("axios");
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
  const parent = ks.length === 1 ? o : getPath(o, ks.slice(0, -1).join("."));
  if (parent) delete parent[ks.at(-1)];
}
function applyUpdate(doc, u) {
  for (const [p, v] of Object.entries(u.$set || {})) setPath(doc, p, v);
  for (const [p, v] of Object.entries(u.$inc || {})) setPath(doc, p, (getPath(doc, p) || 0) + v);
  for (const p of Object.keys(u.$unset || {})) unsetPath(doc, p);
}
const matches = (doc, f) => Object.entries(f).every(([k, v]) => (v === null ? doc[k] == null : String(doc[k]) === String(v)));
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });

Buyer.findOne = (f) => chain(() => db.buyers.find((d) => matches(d, f)));
Admin.findOne = (f) => chain(() => db.admins.find((d) => matches(d, f)));
Buyer.updateOne = async (f, u) => { const d = db.buyers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); };
Buyer.findOneAndUpdate = (f, u) => chain(() => { const d = db.buyers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return d; });

const sellerWrites = [];
const realCollection = mongoose.connection.collection.bind(mongoose.connection);
mongoose.connection.collection = (name) => {
  // Other names only come from Mongoose compiling models when routes/seller.js is loaded.
  if (name !== "sellers") return realCollection(name);
  return {
    findOne: async (f, opts) => {
      const d = clone(db.sellers.find((x) => matches(x, f)));
      if (d && opts?.projection?.password_hash === 0) delete d.password_hash;
      return d;
    },
    updateOne: async (f, u) => { sellerWrites.push(u); const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); },
    findOneAndUpdate: async (f, u) => { sellerWrites.push(u); const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return clone(d); },
  };
};

AuthSession.create = async (data) => { const d = { _id: String(seq++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data }; db.sessions.push(d); return { ...d }; };
AuthSession.findOne = async (f) => clone(db.sessions.find((d) => matches(d, f)));
AuthSession.findOneAndUpdate = async (f, u) => { const d = db.sessions.find((x) => matches(x, f)); if (!d) return null; applyUpdate(d, u); return clone(d); };
AuthSession.updateMany = async (f, u) => { for (const d of db.sessions.filter((x) => matches(x, f))) applyUpdate(d, u); };

let dummyCalls = 0;
const realDummy = passwords.dummyVerify;
passwords.dummyVerify = async (p) => { dummyCalls++; return realDummy(p); };

// Dummy test password + werkzeug 3.0.1 vectors for it (not real credentials).
const PW = "Test-Passw0rd!";
const WZ_SCRYPT = "scrypt:32768:8:1$9NQewi2OozmzRddv$4c4c900c1992e4ac3a4232ee5c12cd9d18cdb34df1a86e6f981a4d2ce327439f55f0ef1089fc2fe539a18e3e362c64cb2df075b1c149e192e18e70d26702769b";
const WZ_PBKDF2 = "pbkdf2:sha256:1000$mzL41N9KnfHroDEK$a95fb49abcf7da10101b617ba7047188afb74f20601270df30314049bbeb8a9d";
const BC10 = bcrypt.hashSync(PW, 10);

function reset() {
  dummyCalls = 0;
  sellerWrites.length = 0;
  flaskCalls.length = 0;
  flaskMode = "ok";
  db.sessions = [];
  db.admins = [{ admin_id: "admin_001", name: "Admin", email: "admin@shaadisahulat.com", password_hash: BC10 }];
  db.buyers = [{ buyer_id: "buyer_b1", name: "Buyer", email: "buyer@example.com", password_hash: BC10 }];
  db.sellers = [
    // the live collision: demo seller sharing the admin email (has a real-looking password hash)
    { seller_id: "sel_8adb42bba8a7", name: "ShaadiSahulat Demo", email: "admin@shaadisahulat.com", password_hash: WZ_SCRYPT },
    { seller_id: "sel_bcrypt00001", name: "Bcrypt Seller", email: "bc@example.com", password_hash: BC10, seller_type: "company",
      auth: { token_version: 0, failed_logins: 0 } },
    { seller_id: "sel_scrypt00001", name: "Scrypt Seller", email: "scrypt@example.com", password_hash: WZ_SCRYPT, city: "Lahore" },
    { seller_id: "sel_pbkdf200001", name: "Pbkdf2 Seller", email: "pbkdf2@example.com", password_hash: WZ_PBKDF2 },
    { seller_id: "SELLER_THRIFT_001", name: "Thrift", email: "thrift@shaadisahulat.com" }, // system seller, no password
    { seller_id: "sel_disabled0001", name: "Disabled", email: "disabled@example.com", password_hash: BC10, auth: { login_disabled: true } },
    { seller_id: "sel_versioned001", name: "Versioned", email: "ver@example.com", password_hash: BC10, auth: { token_version: 4 } },
    ...[1, 2, 3, 4, 5].map((i) => ({ seller_id: `sel_lock${i}`, name: "L", email: `slock${i}@example.com`, password_hash: BC10 })),
  ];
}

// ── Flask stub ──────────────────────────────────────────────────────────────

const flaskCalls = [];
let flaskMode = "ok";
const flask = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : null;
    flaskCalls.push({ method: req.method, url: req.url, headers: req.headers, body });
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url === "/seller/internal/create") {
      if (flaskMode === "down") return send(503, { success: false, error: "Database unavailable" });
      if (flaskMode === "dup") return send(409, { success: false, code: "EMAIL_IN_USE", error: "Email already registered." });
      if (req.headers["x-internal-secret"] !== process.env.INTERNAL_API_SECRET) return send(401, { success: false, error: "Forbidden" });
      const sellerType = body.seller_type === "company" ? "company" : "individual";
      const doc = {
        seller_id: `sel_${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`,
        name: body.name, email: body.email, phone: body.phone, city: body.city,
        password_hash: body.password_hash, seller_type: sellerType, max_listings: sellerType === "company" ? null : 5,
        completed_orders: 0, auth: body.auth,
      };
      db.sellers.push(clone(doc));
      const { password_hash, auth, ...publicDoc } = doc; // Flask strips private fields
      return send(201, { success: true, seller: publicDoc });
    }
    if (req.url.startsWith("/seller/profile/")) return send(200, { success: true, seller: { seller_id: "x", name: "Public" } });
    return send(404, { success: false });
  });
});

const { requireSeller } = require("../../lib/auth");
const authRoutes = require("../../routes/auth");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/seller", require("../../routes/seller")); // legacy /login + /register -> 410 since Phase 2I
app.get("/t/seller", requireSeller, (req, res) => res.json({ user: req.user }));

let base;
const server = app.listen(0);
test.before(async () => {
  await new Promise((r) => flask.listen(0, "127.0.0.1", r));
  process.env.VISUAL_ML_URL = `http://127.0.0.1:${flask.address().port}`;
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); flask.close(); });
// OTP-first registration: pending records + emailed codes (in memory).
const { installPendingFake, captureMail } = require("./_registrationFakes");
const pending = installPendingFake();
const mail = captureMail();
test.beforeEach(() => { reset(); pending.length = 0; mail.mails.length = 0; });
reset();

const CSRF = { "Content-Type": "application/json", "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
const post = (path, body, headers = CSRF) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const login = (email, password = PW, portal = "seller") => post("/api/auth/login", { portal, email, password });
const sellerBy = (email) => db.sellers.find((s) => s.email === email);
const cookieOf = (res) => res.headers.getSetCookie().find((c) => c.startsWith("ss_rt="));
const NEW_SELLER = { name: "Bridal House", email: "bridal@example.com", password: "Str0ng-Passw0rd", phone: "0300-0000000", city: "Karachi", seller_type: "company" };
const assertNoSecrets = (text) => {
  assert.ok(!text.includes("password_hash"), "password_hash leaked");
  assert.ok(!/"auth"\s*:/.test(text), "auth leaked");
  assert.ok(!text.includes("$2a$") && !text.includes("$2b$") && !text.includes("scrypt:"), "hash leaked");
  assert.ok(!text.includes(process.env.INTERNAL_API_SECRET), "internal secret leaked");
};

// ── Registration (OTP-first: the seller exists only after the emailed code is verified) ──

async function startSeller(body = NEW_SELLER) {
  const res = await post("/api/auth/seller/register", body);
  const json = await res.json();
  await mail.settle();
  return { res, json, otp: json.email ? mail.otpFor(json.email) : null };
}
const verifySeller = (json, otp) =>
  post("/api/auth/register/verify", { portal: "seller", email: json.email, otp, registration_token: json.registration_token });

test("seller register: 202 + NO seller and NO Flask call before OTP; verify creates it via internal Flask create — JWT, session, cookie", async () => {
  const { res: reg, json, otp } = await startSeller();
  assert.equal(reg.status, 202);
  assert.equal(json.verification_required, true);
  assert.equal(sellerBy("bridal@example.com"), undefined, "no seller before verification");
  assert.equal(flaskCalls.length, 0, "Flask is not called before verification");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].portal, "seller");

  const res = await verifySeller(json, otp);
  assert.equal(res.status, 201);
  const text = await res.text();
  assertNoSecrets(text);
  const body = JSON.parse(text);

  const stored = sellerBy("bridal@example.com");
  assert.match(stored.seller_id, /^sel_[0-9a-f]{12}$/);
  const p = tokens.verifyAccessToken(body.access_token);
  assert.deepEqual([p.sub, p.kind, p.tv], [stored.seller_id, "seller", 0]);
  assert.deepEqual(body.user, { role: "seller", id: stored.seller_id, name: "Bridal House", email: "bridal@example.com", email_verified: true });
  assert.equal(body.profile.seller_type, "company");
  assert.equal(body.profile.max_listings, null);
  assert.equal(pending.length, 0);

  const session = db.sessions.find((s) => s.session_id === p.sid);
  assert.ok(session && session.user_kind === "seller" && session.user_id === stored.seller_id);
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/auth/);
  assert.equal(session.token_hash, tokens.hashToken(cookie.split(";")[0].slice(6)));
  assert.equal((await login("bridal@example.com", NEW_SELLER.password)).status, 200, "normal login works afterwards");
});

test("seller register: internal request carries X-Internal-Secret and a bcrypt hash, never the plaintext", async () => {
  const { json, otp } = await startSeller();
  assert.ok(!JSON.stringify(pending).includes(NEW_SELLER.password), "pending record never holds the plaintext password");
  await verifySeller(json, otp);
  assert.equal(flaskCalls.length, 1);
  const call = flaskCalls[0];
  assert.equal(call.url, "/seller/internal/create");
  assert.equal(call.headers["x-internal-secret"], process.env.INTERNAL_API_SECRET);
  assert.match(call.body.password_hash, /^\$2[aby]\$10\$/);
  assert.ok(await bcrypt.compare(NEW_SELLER.password, call.body.password_hash));
  assert.ok(!("password" in call.body));
  assert.ok(!JSON.stringify(call.body).includes(NEW_SELLER.password));
  assert.equal(call.body.seller_type, "company");
});

test("seller register: auth sub-document initialized as VERIFIED (token_version 0, no failures, no verification link)", async () => {
  const { json, otp } = await startSeller();
  await verifySeller(json, otp);
  const { auth } = flaskCalls[0].body;
  assert.equal(auth.email_verified, true, "the OTP proved the mailbox");
  assert.equal(auth.token_version, 0);
  assert.equal(auth.failed_logins, 0);
  assert.ok(!Number.isNaN(Date.parse(auth.password_changed_at)));
  const stored = sellerBy("bridal@example.com").auth;
  for (const [k, v] of Object.entries(auth)) assert.deepEqual(stored[k], v, k);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sellerBy("bridal@example.com").auth.verify_token_hash, undefined, "no post-registration verification link");
});

test("seller register: seller_type defaults to individual; invalid type rejected", async () => {
  const { seller_type, ...rest } = NEW_SELLER;
  const { json, otp } = await startSeller(rest);
  const ok = await verifySeller(json, otp);
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.equal(body.profile.seller_type, "individual");
  assert.equal(body.profile.max_listings, 5);
  const bad = await post("/api/auth/seller/register", { ...NEW_SELLER, email: "x2@example.com", seller_type: "admin" });
  assert.equal(bad.status, 400);
});

test("seller register: existing email across buyers, sellers and admins → same 202, no pending record, no OTP, Flask never called", async () => {
  for (const email of ["buyer@example.com", "BC@Example.com", "thrift@shaadisahulat.com", " admin@shaadisahulat.com "]) {
    const { res, json } = await startSeller({ ...NEW_SELLER, email });
    assert.equal(res.status, 202, email);
    assert.equal(json.verification_required, true);
    assert.equal(mail.otpFor(json.email), null);
  }
  assert.equal(pending.length, 0);
  assert.equal(flaskCalls.length, 0);
});

test("seller register: admin-email collision answered without revealing the role", async () => {
  db.sellers = db.sellers.filter((s) => s.email !== "admin@shaadisahulat.com"); // only the admin owns it now
  const { res, json } = await startSeller({ ...NEW_SELLER, email: "admin@shaadisahulat.com" });
  assert.equal(res.status, 202);
  assert.ok(!/admin/i.test(json.message.replace(json.email, "")));
  assert.equal(pending.length, 0);
  assert.equal(flaskCalls.length, 0);
});

test("seller register: password policy and field validation → 400, nothing pending, Flask never called", async () => {
  for (const c of [{ password: "short1" }, { password: "lettersonly" }, { password: "12345678901" },
    { email: "nope" }, { name: "" }, { city: 5 }, { password: "bridal@example.com" }]) {
    const res = await post("/api/auth/seller/register", { ...NEW_SELLER, ...c });
    assert.equal(res.status, 400, JSON.stringify(c));
  }
  assert.equal(pending.length, 0);
  assert.equal(flaskCalls.length, 0);
});

test("seller register: Flask race-duplicate at verify → 409 (pending removed); Flask failure → 503, no session, sign-up kept for a retry", async () => {
  flaskMode = "dup";
  let s1 = await startSeller();
  assert.equal((await verifySeller(s1.json, s1.otp)).status, 409);
  assert.equal(pending.length, 0);
  flaskMode = "down";
  s1 = await startSeller({ ...NEW_SELLER, email: "retry@example.com" });
  assert.equal((await verifySeller(s1.json, s1.otp)).status, 503);
  assert.equal(db.sessions.length, 0);
  assert.equal(pending.length, 1, "pending sign-up kept");
  assert.equal(pending[0].status, "pending");
  assert.equal(pending[0].otp_hash, undefined, "the used code no longer works");
  assert.equal((await verifySeller(s1.json, s1.otp)).status, 400, "same code cannot be replayed");
});

test("seller register: CSRF header required", async () => {
  assert.equal((await post("/api/auth/seller/register", { ...NEW_SELLER, email: "csrf-check@example.com" }, { "Content-Type": "application/json" })).status, 403);
  assert.equal(flaskCalls.length, 0);
  assert.equal(pending.length, 0);
});

// ── Login ───────────────────────────────────────────────────────────────────

test("seller login (bcrypt): JWT kind seller, session, cookie, no secrets returned", async () => {
  const res = await login("BC@example.com");
  assert.equal(res.status, 200);
  const text = await res.text();
  assertNoSecrets(text);
  const body = JSON.parse(text);
  const p = tokens.verifyAccessToken(body.access_token);
  assert.deepEqual([p.sub, p.kind], ["sel_bcrypt00001", "seller"]);
  assert.ok(cookieOf(res));
  assert.equal(db.sessions.length, 1);
  const who = await fetch(`${base}/t/seller`, { headers: { Authorization: `Bearer ${body.access_token}` } });
  assert.equal((await who.json()).user.role, "seller");
});

test("seller login: legacy werkzeug scrypt and pbkdf2 verify and are upgraded to bcrypt", async () => {
  for (const email of ["scrypt@example.com", "pbkdf2@example.com"]) {
    const res = await login(email);
    assert.equal(res.status, 200, email);
    const s = sellerBy(email);
    assert.match(s.password_hash, /^\$2[aby]\$10\$/, `${email} upgraded`);
    assert.ok(await bcrypt.compare(PW, s.password_hash));
    const again = await login(email);
    assert.equal(again.status, 200, `${email} logs in with the upgraded hash`);
  }
  assert.equal(sellerBy("scrypt@example.com").city, "Lahore", "business fields untouched");
});

test("seller login: wrong password → generic 401 identical to buyer failure, failure counted", async () => {
  const buyerFail = await (await login("buyer@example.com", "Wrong-Passw0rd", "buyer")).json();
  const res = await login("bc@example.com", "Wrong-Passw0rd");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), buyerFail);
  assert.equal(sellerBy("bc@example.com").auth.failed_logins, 1);
});

test("seller login: unknown email → identical 401 with dummy verification", async () => {
  dummyCalls = 0;
  const res = await login("nobody@example.com");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
  assert.equal(dummyCalls, 1);
});

test("seller login: admin-email collision (sel_8adb42bba8a7) refused even with the correct password; record untouched", async () => {
  const before = clone(sellerBy("admin@shaadisahulat.com"));
  dummyCalls = 0;
  const res = await login("admin@shaadisahulat.com", PW);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
  assert.equal(dummyCalls, 1);
  assert.deepEqual(sellerBy("admin@shaadisahulat.com"), before, "demo seller must not be modified");
  assert.equal(db.sessions.length, 0);
});

test("seller login: wrong portal and system seller without password → generic 401", async () => {
  for (const [email, portal] of [["bc@example.com", "buyer"], ["buyer@example.com", "seller"], ["bc@example.com", "admin"],
    ["thrift@shaadisahulat.com", "seller"]]) {
    dummyCalls = 0;
    const res = await login(email, PW, portal);
    assert.equal(res.status, 401, `${email}/${portal}`);
    assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
    assert.equal(dummyCalls, 1, `${email}/${portal} dummy`);
  }
  assert.equal(db.sessions.length, 0);
});

test("seller login: 5 failures lock for 15 min; correct password refused while locked", async () => {
  const email = "slock1@example.com";
  for (let i = 0; i < 5; i++) assert.equal((await login(email, "Wrong-Passw0rd")).status, 401);
  const s = sellerBy(email);
  const minutes = (new Date(s.auth.lock_until) - Date.now()) / 60000;
  assert.ok(minutes > 14.9 && minutes <= 15);
  dummyCalls = 0;
  assert.equal((await login(email)).status, 401);
  assert.equal(dummyCalls, 1);
  assert.equal(db.sessions.length, 0);
});

test("seller login: lock expiry allows login; 5 new failures lock again", async () => {
  const email = "slock2@example.com";
  for (let i = 0; i < 5; i++) await login(email, "Wrong-Passw0rd");
  sellerBy(email).auth.lock_until = new Date(Date.now() - 1000);
  assert.equal((await login(email)).status, 200);
  assert.equal(sellerBy(email).auth.lock_until, undefined);
  assert.equal(sellerBy(email).auth.failed_logins, 0);

  const email3 = "slock3@example.com";
  for (let i = 0; i < 5; i++) await login(email3, "Wrong-Passw0rd");
  sellerBy(email3).auth.lock_until = new Date(Date.now() - 1000);
  for (let i = 0; i < 5; i++) await login(email3, "Wrong-Passw0rd");
  assert.ok(new Date(sellerBy(email3).auth.lock_until) > new Date(), "locked again");
});

test("seller login: success resets failed-login state", async () => {
  const email = "slock4@example.com";
  for (let i = 0; i < 3; i++) await login(email, "Wrong-Passw0rd");
  assert.equal(sellerBy(email).auth.failed_logins, 3);
  assert.equal((await login(email)).status, 200);
  assert.equal(sellerBy(email).auth.failed_logins, 0);
});

test("seller login: disabled seller → generic 401", async () => {
  assert.equal((await login("disabled@example.com")).status, 401);
  assert.equal(db.sessions.length, 0);
});

test("seller login: token_version carried into JWT; /me and refresh work", async () => {
  const res = await login("ver@example.com");
  const body = await res.json();
  assert.equal(tokens.verifyAccessToken(body.access_token).tv, 4);
  const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${body.access_token}` } });
  assert.equal((await me.json()).user.role, "seller");
  const r = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...CSRF, Cookie: cookieOf(res).split(";")[0] } });
  assert.equal(r.status, 200);
  assert.equal(tokens.verifyAccessToken((await r.json()).access_token).tv, 4);
  sellerBy("ver@example.com").auth.token_version = 5; // e.g. logout-all elsewhere
  const stale = await fetch(`${base}/t/seller`, { headers: { Authorization: `Bearer ${body.access_token}` } });
  assert.equal((await stale.json()).code, "TOKEN_REVOKED");
});

test("seller login: per IP+email rate limit → 429", async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await login("ratelimit-seller@example.com", "Wrong-Passw0rd")).status);
  assert.equal(statuses[9], 401);
  assert.equal(statuses[10], 429);
});

// ── Legacy /api/seller/login + /register (removed in Phase 2I) ─────────────

test("legacy /api/seller/login + /register -> 410 Gone: no credential check, no lockout, no session, no Flask call", async () => {
  const h = { "Content-Type": "application/json" };
  const before = structuredClone(sellerBy("bc@example.com").auth);
  const cases = [
    ["/api/seller/login", { email: "scrypt@example.com", password: PW }], // correct password
    ["/api/seller/login", { email: "bc@example.com", password: "Wrong-Passw0rd" }],
    ["/api/seller/register", { ...NEW_SELLER, email: "legacy-new@example.com" }],
  ];
  for (const [p, body] of cases) {
    const r = await post(p, body, h);
    assert.equal(r.status, 410, p);
    const text = await r.text();
    assertNoSecrets(text);
    const b = JSON.parse(text);
    assert.equal(b.code, "ENDPOINT_REMOVED");
    assert.ok(!("seller" in b) && !("access_token" in b));
  }
  assert.equal((await fetch(`${base}/api/seller/login`)).status, 410, "every method is gone");
  assert.deepEqual(sellerBy("bc@example.com").auth, before, "the legacy path no longer counts failed logins");
  assert.equal(sellerBy("legacy-new@example.com"), undefined, "nothing registered");
  assert.equal(db.sessions.length, 0);
  assert.equal(flaskCalls.length, 0, "no Flask call");
  assert.equal((await login("scrypt@example.com")).status, 200, "canonical /api/auth/login still works");
});

// ── Internal secret scope ───────────────────────────────────────────────────

test("internal secret goes to the internal Flask origin only — never a global default, never another host (Phase 2I)", async () => {
  require("../../lib/flaskHttp"); // installs the origin-scoped interceptor (server.js does this at startup)
  assert.equal(axios.defaults.headers.common["X-Internal-Secret"], undefined);
  assert.equal(axios.defaults.headers["X-Internal-Secret"], undefined);
  // sellerClient captures VISUAL_ML_URL at load time → load a fresh copy pointed at the stub.
  delete require.cache[require.resolve("../../services/sellerClient")];
  const freshClient = require("../../services/sellerClient");
  assert.ok(process.env.VISUAL_ML_URL.startsWith("http://127.0.0.1:"));
  await freshClient.getSellerProfile("x"); // Flask now requires the secret on every non-public route
  const flaskCall = flaskCalls.find((c) => c.url.startsWith("/seller/profile/"));
  assert.ok(flaskCall);
  assert.equal(flaskCall.headers["x-internal-secret"], process.env.INTERNAL_API_SECRET);

  // Same stub reached through a different origin (localhost vs 127.0.0.1) is NOT internal → no secret.
  const other = process.env.VISUAL_ML_URL.replace("127.0.0.1", "localhost");
  flaskCalls.length = 0;
  await axios.get(`${other}/seller/profile/y`).catch(() => {});
  const external = flaskCalls.find((c) => c.url.startsWith("/seller/profile/y"));
  assert.ok(external, "request reached the stub");
  assert.equal(external.headers["x-internal-secret"], undefined);
});
