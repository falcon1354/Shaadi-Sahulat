/**
 * Phase 2D — admin login, change-password, seed-credential safety.
 * Run: npm run test:auth
 *
 * Isolated: Admin/Buyer/sellers/auth_sessions are in-memory fakes. Seed scripts are
 * spawned with an unreachable MONGODB_URI, so they can never touch a real database.
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
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "../..");
const tokens = require("../../lib/tokens");
const passwords = require("../../lib/passwords");
const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const AuthSession = require("../../models/AuthSession");

// ── In-memory fakes ─────────────────────────────────────────────────────────

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
const matches = (doc, f) => Object.entries(f).every(([k, v]) => (v === null ? doc[k] == null : String(doc[k]) === String(v)));
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });
function fakeModel(Model, key) {
  Model.findOne = (f) => chain(() => db[key].find((d) => matches(d, f)));
  Model.updateOne = async (f, u) => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); };
  Model.findOneAndUpdate = (f, u) => chain(() => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); return d; });
}
fakeModel(Admin, "admins");
fakeModel(Buyer, "buyers");
mongoose.connection.collection = () => ({
  findOne: async (f, o) => { const d = clone(db.sellers.find((x) => matches(x, f))); if (d && o?.projection?.password_hash === 0) delete d.password_hash; return d; },
  updateOne: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); },
  findOneAndUpdate: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return clone(d); },
});
AuthSession.create = async (data) => { const d = { _id: String(seq++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data }; db.sessions.push(d); return { ...d }; };
AuthSession.findOne = async (f) => clone(db.sessions.find((d) => matches(d, f)));
AuthSession.findOneAndUpdate = async (f, u) => { const d = db.sessions.find((x) => matches(x, f)); if (!d) return null; applyUpdate(d, u); return clone(d); };
AuthSession.updateMany = async (f, u) => { for (const d of db.sessions.filter((x) => matches(x, f))) applyUpdate(d, u); };

let dummyCalls = 0;
const realDummy = passwords.dummyVerify;
passwords.dummyVerify = async (p) => { dummyCalls++; return realDummy(p); };

const PW = "Adm1n-Test-Passw0rd";          // dummy test password (not a real credential)
const NEW_PW = "N3w-Adm1n-Passw0rd!";
const BC10 = bcrypt.hashSync(PW, 10);
const BC4 = bcrypt.hashSync(PW, 4);

function reset() {
  dummyCalls = 0;
  db.sessions = [];
  db.admins = [
    { _id: "oid-admin", admin_id: "admin_001", name: "Super Admin", email: "admin@shaadisahulat.com", password_hash: BC10 },
    { _id: "oid-a2", admin_id: "admin_weak", name: "Weak", email: "weak@admin.test", password_hash: BC4 },
    { _id: "oid-a3", admin_id: "admin_ver", name: "Ver", email: "ver@admin.test", password_hash: BC10, auth: { token_version: 3 } },
    { _id: "oid-a4", admin_id: "admin_dis", name: "Dis", email: "dis@admin.test", password_hash: BC10, auth: { login_disabled: true } },
    ...[1, 2, 3, 4, 5, 6].map((i) => ({ _id: `oid-l${i}`, admin_id: `admin_lock${i}`, name: "L", email: `alock${i}@admin.test`, password_hash: BC10 })),
  ];
  db.buyers = [{ buyer_id: "buyer_b1", name: "Buyer", email: "buyer@example.com", password_hash: BC10 }];
  db.sellers = [
    { seller_id: "sel_8adb42bba8a7", name: "Demo", email: "admin@shaadisahulat.com", password_hash: BC10 },
    { seller_id: "sel_s1", name: "Seller", email: "seller@example.com", password_hash: BC10 },
  ];
}
reset();

const { requireAdmin } = require("../../lib/auth");
const authRoutes = require("../../routes/auth");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/admin", require("../../routes/admin")); // legacy /login -> 410 since Phase 2I
app.get("/t/admin", requireAdmin, (req, res) => res.json({ user: req.user }));

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(reset);

const CSRF = { "Content-Type": "application/json", "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
const post = (p, body, headers = CSRF) => fetch(`${base}${p}`, { method: "POST", headers, body: JSON.stringify(body) });
const login = (email, password = PW, portal = "admin") => post("/api/auth/login", { portal, email, password });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const adminBy = (email) => db.admins.find((a) => a.email === email);
const cookieOf = (res) => res.headers.getSetCookie().find((c) => c.startsWith("ss_rt="));
const changePw = (token, body) => post("/api/auth/change-password", body, { "Content-Type": "application/json", ...(token ? bearer(token) : {}) });
function assertNoSecrets(text) {
  assert.ok(!text.includes("password_hash"), "password_hash leaked");
  assert.ok(!/"auth"\s*:/.test(text), "auth leaked");
  assert.ok(!/\$2[aby]\$/.test(text), "hash leaked");
  assert.ok(!text.includes(PW) && !text.includes(NEW_PW), "password leaked");
}
async function loginToken(email, password = PW, portal = "admin") {
  const res = await login(email, password, portal);
  assert.equal(res.status, 200, `login ${email}`);
  return { body: await res.json(), cookie: cookieOf(res).split(";")[0] };
}

// ── Admin login ─────────────────────────────────────────────────────────────

test("admin login: JWT kind admin + admin_id, session, HttpOnly cookie, no secrets", async () => {
  const res = await login(" Admin@ShaadiSahulat.com ");
  assert.equal(res.status, 200);
  const text = await res.text();
  assertNoSecrets(text);
  const body = JSON.parse(text);
  const p = tokens.verifyAccessToken(body.access_token);
  assert.deepEqual([p.sub, p.kind, p.tv], ["admin_001", "admin", 0]);
  assert.deepEqual(body.user, { role: "admin", id: "admin_001", name: "Super Admin", email: "admin@shaadisahulat.com", email_verified: true });
  const s = db.sessions.find((x) => x.session_id === p.sid);
  assert.ok(s && s.user_kind === "admin" && s.user_id === "admin_001");
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/auth/);
});

test("requireAdmin accepts admin JWT (role admin, id admin_id); buyer JWT → 403; invalid JWT → 401", async () => {
  const { body } = await loginToken("admin@shaadisahulat.com");
  const ok = await fetch(`${base}/t/admin`, { headers: bearer(body.access_token) });
  assert.equal(ok.status, 200);
  const { user } = await ok.json();
  assert.deepEqual([user.role, user.id, user.auth_method], ["admin", "admin_001", "jwt"]);
  assertNoSecrets(JSON.stringify(user));

  const buyer = await loginToken("buyer@example.com", PW, "buyer");
  assert.equal((await fetch(`${base}/t/admin`, { headers: bearer(buyer.body.access_token) })).status, 403);
  assert.equal((await fetch(`${base}/t/admin`, { headers: bearer("x.y.z") })).status, 401);
});

test("forged legacy admin headers never win when a Bearer token is present", async () => {
  const LEGACY_ADMIN = { "x-user-id": "admin_001", "x-user-role": "admin" };
  const buyer = await loginToken("buyer@example.com", PW, "buyer");
  // valid buyer JWT + forged admin headers → JWT identity (buyer) → 403
  assert.equal((await fetch(`${base}/t/admin`, { headers: { ...bearer(buyer.body.access_token), ...LEGACY_ADMIN } })).status, 403);
  // forged/invalid JWT + admin headers → 401 (no fallback)
  const forged = jwt.sign({ kind: "admin", tv: 0, sid: "s" }, "attacker-secret-attacker-secret-attacker-x",
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "admin_001", expiresIn: "15m" });
  for (const p of ["/t/admin"]) {
    assert.equal((await fetch(`${base}${p}`, { headers: { ...bearer(forged), ...LEGACY_ADMIN } })).status, 401);
  }
  // new auth endpoints never accept legacy headers at all
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: LEGACY_ADMIN })).status, 401);
  assert.equal((await changePw(null, { currentPassword: PW, newPassword: NEW_PW }).then((r) => r.status)), 401);
  assert.equal((await post("/api/auth/change-password", { currentPassword: PW, newPassword: NEW_PW },
    { "Content-Type": "application/json", ...LEGACY_ADMIN })).status, 401);
});

test("admin login: wrong password → generic 401, failure counted", async () => {
  const res = await login("admin@shaadisahulat.com", "Wrong-Passw0rd");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { success: false, code: "INVALID_CREDENTIALS", error: "Invalid email or password." });
  assert.equal(adminBy("admin@shaadisahulat.com").auth.failed_logins, 1);
});

test("admin login: unknown email → generic 401 with dummy verification", async () => {
  dummyCalls = 0;
  const res = await login("nobody@admin.test");
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
  assert.equal(dummyCalls, 1);
});

test("wrong portal: admin creds at buyer/seller portals and non-admins at admin portal → generic 401 + dummy", async () => {
  for (const [email, portal] of [["admin@shaadisahulat.com", "buyer"], ["admin@shaadisahulat.com", "seller"],
    ["buyer@example.com", "admin"], ["seller@example.com", "admin"], ["admin@shaadisahulat.com", "superadmin"]]) {
    dummyCalls = 0;
    const res = await login(email, PW, portal);
    assert.equal(res.status, 401, `${email}/${portal}`);
    assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
    assert.equal(dummyCalls, 1, `${email}/${portal}`);
  }
  assert.equal(db.sessions.length, 0);
});

test("admin login: 5 failures lock for 15 minutes; correct password refused while locked", async () => {
  const email = "alock1@admin.test";
  for (let i = 0; i < 5; i++) assert.equal((await login(email, "Wrong-Passw0rd")).status, 401);
  const minutes = (new Date(adminBy(email).auth.lock_until) - Date.now()) / 60000;
  assert.ok(minutes > 14.9 && minutes <= 15);
  dummyCalls = 0;
  assert.equal((await login(email)).status, 401);
  assert.equal(dummyCalls, 1);
  assert.equal(db.sessions.length, 0);
});

test("admin login: lock expiry, then locking again after expiry", async () => {
  const email = "alock2@admin.test";
  for (let i = 0; i < 5; i++) await login(email, "Wrong-Passw0rd");
  adminBy(email).auth.lock_until = new Date(Date.now() - 1000);
  assert.equal((await login(email)).status, 200);
  assert.equal(adminBy(email).auth.lock_until, undefined);

  const email3 = "alock3@admin.test";
  for (let i = 0; i < 5; i++) await login(email3, "Wrong-Passw0rd");
  adminBy(email3).auth.lock_until = new Date(Date.now() - 1000);
  for (let i = 0; i < 5; i++) await login(email3, "Wrong-Passw0rd");
  assert.ok(new Date(adminBy(email3).auth.lock_until) > new Date(), "locked again");
});

test("admin login: success resets failed-login state", async () => {
  const email = "alock4@admin.test";
  for (let i = 0; i < 3; i++) await login(email, "Wrong-Passw0rd");
  assert.equal(adminBy(email).auth.failed_logins, 3);
  assert.equal((await login(email)).status, 200);
  assert.equal(adminBy(email).auth.failed_logins, 0);
});

test("admin login: disabled admin → generic 401", async () => {
  assert.equal((await login("dis@admin.test")).status, 401);
  assert.equal(db.sessions.length, 0);
});

test("admin login: weak bcrypt hash upgraded to BCRYPT_ROUNDS; token_version carried", async () => {
  assert.equal((await login("weak@admin.test")).status, 200);
  assert.match(adminBy("weak@admin.test").password_hash, /^\$2[aby]\$10\$/);
  const { body } = await loginToken("ver@admin.test");
  assert.equal(tokens.verifyAccessToken(body.access_token).tv, 3);
});

test("legacy /api/admin/login -> 410 Gone: never verifies credentials, no admin data, no session; no admin signup", async () => {
  const h = { "Content-Type": "application/json" };
  const before = structuredClone(adminBy("admin@shaadisahulat.com").auth || null);
  const ok = await post("/api/admin/login", { email: "admin@shaadisahulat.com", password: PW }, h);
  assert.equal(ok.status, 410);
  const text = await ok.text();
  assertNoSecrets(text);
  const body = JSON.parse(text);
  assert.equal(body.code, "ENDPOINT_REMOVED");
  assert.ok(!("admin" in body) && !("access_token" in body));
  assert.equal((await post("/api/admin/login", { email: "admin@shaadisahulat.com", password: "Wrong" }, h)).status, 410);
  assert.deepEqual(adminBy("admin@shaadisahulat.com").auth || null, before, "no failed-login counting");
  assert.equal(db.sessions.length, 0);
  for (const p of ["/api/admin/register", "/api/admin/signup"]) {
    assert.ok([401, 404].includes((await post(p, { email: "x@x.test", password: PW }, h)).status), p);
  }
  assert.equal((await login("admin@shaadisahulat.com")).status, 200, "canonical /api/auth/login still works");
});

test("there is no admin registration endpoint", async () => {
  for (const p of ["/api/auth/admin/register", "/api/auth/register"]) {
    const res = await post(p, { name: "X", email: "x@admin.test", password: NEW_PW });
    assert.equal(res.status, 404, p);
  }
});

// ── Change password ─────────────────────────────────────────────────────────

test("change-password: unauthenticated / invalid token rejected", async () => {
  assert.equal((await changePw(null, { currentPassword: PW, newPassword: NEW_PW })).status, 401);
  assert.equal((await changePw("x.y.z", { currentPassword: PW, newPassword: NEW_PW })).status, 401);
});

test("change-password: wrong current, invalid new, same password → 400 and nothing changes", async () => {
  const { body } = await loginToken("admin@shaadisahulat.com");
  const before = clone(adminBy("admin@shaadisahulat.com"));
  const cases = [
    [{ currentPassword: "Wrong-Passw0rd", newPassword: NEW_PW }, "INVALID_CURRENT_PASSWORD"],
    [{ currentPassword: PW, newPassword: "short1" }, "VALIDATION_ERROR"],
    [{ currentPassword: PW, newPassword: "nodigitshere" }, "VALIDATION_ERROR"],
    [{ currentPassword: PW, newPassword: "Admin@ShaadiSahulat.com" }, "VALIDATION_ERROR"], // equals the email
    [{ currentPassword: PW, newPassword: PW }, "SAME_PASSWORD"],
    [{ currentPassword: PW }, "VALIDATION_ERROR"],
  ];
  for (const [payload, code] of cases) {
    const res = await changePw(body.access_token, payload);
    assert.equal(res.status, 400, JSON.stringify(payload));
    const text = await res.text();
    assert.equal(JSON.parse(text).code, code, JSON.stringify(payload));
    assertNoSecrets(text);
  }
  const after = adminBy("admin@shaadisahulat.com");
  assert.equal(after.password_hash, before.password_hash);
  assert.equal(after.auth?.token_version, before.auth?.token_version);
});

test("change-password (admin): hash updated, token_version++, lock cleared, sessions revoked, old token dead", async () => {
  const first = await loginToken("alock6@admin.test");
  const second = await loginToken("alock6@admin.test"); // another device
  const a = adminBy("alock6@admin.test");
  a.auth.failed_logins = 3;
  a.auth.lock_until = new Date(Date.now() - 1); // stale lock state to be cleared
  const tvBefore = a.auth.token_version || 0;

  const res = await changePw(first.body.access_token, { currentPassword: PW, newPassword: NEW_PW });
  assert.equal(res.status, 200);
  const text = await res.text();
  assertNoSecrets(text);
  assert.deepEqual(JSON.parse(text), { success: true, message: "Password changed. Please sign in again." });
  assert.match(cookieOf(res), /ss_rt=;/, "refresh cookie cleared");

  const after = adminBy("alock6@admin.test");
  assert.ok(await bcrypt.compare(NEW_PW, after.password_hash), "password_hash updated");
  assert.ok(!(await bcrypt.compare(PW, after.password_hash)));
  assert.equal(after.auth.token_version, tvBefore + 1, "token_version incremented");
  assert.ok(after.auth.password_changed_at instanceof Date);
  assert.equal(after.auth.failed_logins, 0);
  assert.equal(after.auth.lock_until, undefined);
  assert.ok(db.sessions.filter((s) => s.user_id === "admin_lock6").every((s) => s.revoked_at), "all sessions revoked");

  for (const t of [first.body.access_token, second.body.access_token]) {
    const r = await fetch(`${base}/t/admin`, { headers: bearer(t) });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, "TOKEN_REVOKED", "old access token rejected immediately");
  }
  for (const c of [first.cookie, second.cookie]) {
    const r = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...CSRF, Cookie: c } });
    assert.equal(r.status, 401, "old refresh cookie rejected");
  }

  assert.equal((await login("alock6@admin.test", PW)).status, 401, "old password no longer works");
  const fresh = await loginToken("alock6@admin.test", NEW_PW);
  assert.equal(tokens.verifyAccessToken(fresh.body.access_token).tv, tvBefore + 1, "new password works with new tv");
});

test("change-password works for sellers (Node writes credentials; no Flask call) and buyers", async () => {
  const s = await loginToken("seller@example.com", PW, "seller");
  assert.equal((await changePw(s.body.access_token, { currentPassword: PW, newPassword: NEW_PW })).status, 200);
  const seller = db.sellers.find((x) => x.seller_id === "sel_s1");
  assert.ok(await bcrypt.compare(NEW_PW, seller.password_hash));
  assert.equal(seller.auth.token_version, 1);
  assert.equal((await login("seller@example.com", NEW_PW, "seller")).status, 200);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: bearer(s.body.access_token) })).status, 401);

  const b = await loginToken("buyer@example.com", PW, "buyer");
  assert.equal((await changePw(b.body.access_token, { currentPassword: PW, newPassword: NEW_PW })).status, 200);
  assert.equal(db.buyers[0].auth.token_version, 1);
  assert.equal((await login("buyer@example.com", NEW_PW, "buyer")).status, 200);
});

// ── Seed credential safety ──────────────────────────────────────────────────

const SEED_FILES = ["seeds/seedAdmin.js", "scripts/fix-demo-logins.js", "seeds/seedFullLifecycleV2.js", "visual-ml-service/seed_dummy_data.py"];

test("no hardcoded admin password remains in seed/maintenance scripts", () => {
  for (const f of SEED_FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/Admin@\d/.test(src), `${f}: admin password literal`);
  }
  for (const f of ["seeds/seedAdmin.js", "scripts/fix-demo-logins.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/hashSync\(\s*["'`]/.test(src), `${f}: hashSync with a literal`);
    assert.ok(!/compareSync\(\s*["'`]/.test(src), `${f}: compareSync with a literal`);
    assert.ok(!/password\s*[:=]\s*["'`][^"'`]+["'`]/i.test(src), `${f}: password literal`);
  }
  assert.ok(!/"password":\s*"/.test(fs.readFileSync(path.join(ROOT, "visual-ml-service/seed_dummy_data.py"), "utf8")));
});

const SAFE_ENV = {
  ...process.env,
  MONGODB_URI: "mongodb://127.0.0.1:1/never?serverSelectionTimeoutMS=800",
  MONGO_URI: "mongodb://127.0.0.1:1/never",
  ADMIN_SEED_EMAIL: "",
  ADMIN_SEED_PASSWORD: "",
  ADMIN_SEED_NAME: "",
  DEMO_BUYER_PASSWORD: "",
};
const run = (script, env) => spawnSync(process.execPath, [script], {
  cwd: ROOT, env: { ...SAFE_ENV, ...env }, input: "", encoding: "utf8", timeout: 60000,
});

test("seedAdmin: missing credentials fail clearly before touching the database", () => {
  const r = run("seeds/seedAdmin.js", {});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ADMIN_SEED_EMAIL/);
  assert.ok(!/Connected to MongoDB/.test(r.stdout), "must not connect");
  const r2 = run("seeds/seedAdmin.js", { ADMIN_SEED_EMAIL: "new-admin@example.test" });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /ADMIN_SEED_PASSWORD/);
});

test("seedAdmin: weak password rejected by policy; password never printed", () => {
  const weak = "weakpass";
  const r = run("seeds/seedAdmin.js", { ADMIN_SEED_EMAIL: "new-admin@example.test", ADMIN_SEED_PASSWORD: weak });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /password policy/);
  assert.ok(!(r.stdout + r.stderr).includes(weak));
});

test("seedAdmin: valid credentials are never printed (fails only at the unreachable DB)", () => {
  const secret = "Str0ng-Seed-Passw0rd-xyz";
  const r = run("seeds/seedAdmin.js", { ADMIN_SEED_EMAIL: "new-admin@example.test", ADMIN_SEED_PASSWORD: secret });
  assert.equal(r.status, 1);
  assert.ok(!(r.stdout + r.stderr).includes(secret), "password must not appear in output");
  assert.match(r.stderr, /\[seedAdmin\]/);
});

test("fix-demo-logins: missing/weak credentials fail safely, nothing printed", () => {
  const r = run("scripts/fix-demo-logins.js", {});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ADMIN_SEED_EMAIL/);
  const weak = "weakbuyer";
  const r2 = run("scripts/fix-demo-logins.js", {
    ADMIN_SEED_EMAIL: "new-admin@example.test", ADMIN_SEED_PASSWORD: "Str0ng-Seed-Passw0rd-xyz", DEMO_BUYER_PASSWORD: weak,
  });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /Demo buyer password does not meet the password policy/);
  assert.ok(!(r2.stdout + r2.stderr).includes(weak) && !(r2.stdout + r2.stderr).includes("Str0ng-Seed-Passw0rd-xyz"));
});

test("resolveAdminSeedCredentials: env → validated credentials; errors never contain the password", async () => {
  const { resolveAdminSeedCredentials, SeedCredentialError } = require("../../lib/seedCredentials");
  const ok = await resolveAdminSeedCredentials({ env: { ADMIN_SEED_EMAIL: " Boss@Example.test ", ADMIN_SEED_PASSWORD: NEW_PW }, interactive: false });
  assert.deepEqual(ok, { email: "boss@example.test", password: NEW_PW, name: "Super Admin" });
  await assert.rejects(resolveAdminSeedCredentials({ env: {}, interactive: false }), SeedCredentialError);
  await assert.rejects(resolveAdminSeedCredentials({ env: { ADMIN_SEED_EMAIL: "not-an-email", ADMIN_SEED_PASSWORD: NEW_PW }, interactive: false }), /not a valid email/);
  try {
    await resolveAdminSeedCredentials({ env: { ADMIN_SEED_EMAIL: "a@b.test", ADMIN_SEED_PASSWORD: "tooweak" }, interactive: false });
    assert.fail("should reject");
  } catch (e) {
    assert.ok(e instanceof SeedCredentialError);
    assert.ok(!e.message.includes("tooweak"));
  }
});
