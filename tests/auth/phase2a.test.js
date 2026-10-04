/**
 * Phase 2A — JWT core tests.
 * Run: npm run test:auth
 *
 * Fully isolated: auth_sessions is replaced by an in-memory fake and profile
 * lookups are stubbed, so no MongoDB connection is made.
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
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const tokens = require("../../lib/tokens");
const passwords = require("../../lib/passwords");
const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const AuthSession = require("../../models/AuthSession");

// ── In-memory fakes ─────────────────────────────────────────────────────────

const store = { sessions: [], buyers: [], admins: [], sellers: [], incs: [] };
let nextId = 1;

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    const actual = k === "_id" ? String(doc._id) : doc[k];
    if (v === null) return actual === null || actual === undefined;
    return k === "_id" ? actual === String(v) : actual === v;
  });
}

AuthSession.create = async (data) => {
  const doc = { _id: String(nextId++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data };
  store.sessions.push(doc);
  return { ...doc };
};
AuthSession.findOne = async (filter) => {
  const d = store.sessions.find((s) => matches(s, filter));
  return d ? { ...d } : null;
};
AuthSession.findOneAndUpdate = async (filter, update) => {
  const d = store.sessions.find((s) => matches(s, filter));
  if (!d) return null;
  Object.assign(d, update.$set);
  return { ...d };
};
AuthSession.updateMany = async (filter, update) => {
  for (const d of store.sessions.filter((s) => matches(s, filter))) Object.assign(d, update.$set);
};

const chain = (result) => ({ select() { return this; }, lean: async () => (result ? structuredClone(result) : null) });
Buyer.findOne = (q) => chain(store.buyers.find((b) => b.buyer_id === q.buyer_id));
Admin.findOne = (q) => chain(store.admins.find((a) => a.admin_id === q.admin_id));
Buyer.updateOne = async (q, u) => {
  store.incs.push({ kind: "buyer", q, u });
  const b = store.buyers.find((x) => x.buyer_id === q.buyer_id);
  if (b) b.auth = { ...(b.auth || {}), token_version: ((b.auth || {}).token_version || 0) + 1 };
};
mongoose.connection.collection = () => ({
  findOne: async (q, opts) => {
    const s = store.sellers.find((x) => x.seller_id === q.seller_id);
    if (!s) return null;
    const copy = structuredClone(s);
    if (opts?.projection?.password_hash === 0) delete copy.password_hash;
    return copy;
  },
  updateOne: async () => {},
});

function resetStore() {
  store.sessions = [];
  store.incs = [];
  store.buyers = [
    { buyer_id: "buyer_A", name: "Aisha", email: "a@example.com", password_hash: "$2a$10$x", city: "Lahore" },
    { buyer_id: "buyer_V", name: "Versioned", email: "v@example.com", password_hash: "h", auth: { token_version: 3 } },
    { buyer_id: "buyer_D", name: "Disabled", email: "d@example.com", password_hash: "h", auth: { login_disabled: true } },
  ];
  store.admins = [{ admin_id: "admin_T", name: "Admin", email: "adm@example.com", password_hash: "h" }];
  store.sellers = [{ seller_id: "sel_T", name: "Seller", email: "s@example.com", password_hash: "werk", seller_type: "company" }];
}
resetStore();

// Required after the fakes so modules bind to the patched statics.
const { requireBuyer, requireAdmin, authenticate, optionalAuth } = require("../../lib/auth");
const sessions = require("../../lib/authSessions");
const authRoutes = require("../../routes/auth");

// ── Test HTTP app ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.get("/t/buyer", requireBuyer, (req, res) => res.json({ user: req.user }));
app.get("/t/admin", requireAdmin, (req, res) => res.json({ user: req.user }));
app.get("/t/any", authenticate, (req, res) => res.json({ user: req.user }));
app.get("/t/optional", optionalAuth, (req, res) => res.json({ user: req.user || null }));

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { resetStore(); process.env.AUTH_LEGACY_HEADERS = "true"; });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const access = (over = {}) => tokens.signAccessToken({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "sid-1", ...over });
const LEGACY_BUYER = { "x-user-id": "buyer_A", "x-user-role": "buyer" };
const LEGACY_ADMIN = { "x-user-id": "admin_x", "x-user-role": "admin" };
const CSRF = { "X-Requested-With": "ShaadiSahulat" };

// ── JWT ─────────────────────────────────────────────────────────────────────

test("JWT creation: HS256 with sub/kind/tv/sid/iss/aud/iat/exp and 15-minute lifetime", () => {
  const t = access({ tv: 2 });
  const { header, payload } = jwt.decode(t, { complete: true });
  assert.equal(header.alg, "HS256");
  assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "kind", "sid", "sub", "tv"]);
  assert.equal(payload.iss, "shaadisahulat-api");
  assert.equal(payload.aud, "shaadisahulat-web");
  assert.equal(payload.exp - payload.iat, 15 * 60);
  assert.equal(payload.sub, "buyer_A");
  assert.equal(payload.tv, 2);
});

test("JWT verification: valid token returns payload", () => {
  const p = tokens.verifyAccessToken(access());
  assert.equal(p.kind, "buyer");
  assert.equal(p.sid, "sid-1");
});

test("JWT rejects invalid signature", () => {
  const forged = jwt.sign({ kind: "admin", tv: 0, sid: "s" }, "some-other-secret-that-is-long-enough-000",
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "admin_T", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(forged), { code: "INVALID_TOKEN" });
});

test("JWT rejects wrong issuer", () => {
  const t = jwt.sign({ kind: "buyer", tv: 0, sid: "s" }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: "evil", audience: tokens.AUDIENCE, subject: "buyer_A", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(t), { code: "INVALID_TOKEN" });
});

test("JWT rejects wrong audience", () => {
  const t = jwt.sign({ kind: "buyer", tv: 0, sid: "s" }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: "other-app", subject: "buyer_A", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(t), { code: "INVALID_TOKEN" });
});

test("JWT rejects expired token with TOKEN_EXPIRED", () => {
  const now = Math.floor(Date.now() / 1000);
  const t = jwt.sign({ kind: "buyer", tv: 0, sid: "s", iat: now - 1000, exp: now - 10 }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "buyer_A" });
  assert.throws(() => tokens.verifyAccessToken(t), { code: "TOKEN_EXPIRED" });
});

test("JWT algorithm is pinned: alg=none and HS512 are rejected", () => {
  const none = jwt.sign({ kind: "admin", tv: 0, sid: "s" }, null,
    { algorithm: "none", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "admin_T", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(none), { code: "INVALID_TOKEN" });
  const hs512 = jwt.sign({ kind: "buyer", tv: 0, sid: "s" }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS512", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "buyer_A", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(hs512), { code: "INVALID_TOKEN" });
});

test("JWT rejects tokens missing required claims or with unknown kind", () => {
  const noSid = jwt.sign({ kind: "buyer", tv: 0 }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "buyer_A", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(noSid), { code: "INVALID_TOKEN" });
  const badKind = jwt.sign({ kind: "superuser", tv: 0, sid: "s" }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "x", expiresIn: "15m" });
  assert.throws(() => tokens.verifyAccessToken(badKind), { code: "INVALID_TOKEN" });
});

test("startup validation reports missing/weak settings by name only", () => {
  const saved = { ...process.env };
  try {
    process.env.JWT_ACCESS_SECRET = "short";
    delete process.env.INTERNAL_API_SECRET;
    process.env.FRONTEND_ORIGIN = "http://localhost:3000/path";
    const problems = tokens.validateAuthConfig().join(" | ");
    assert.match(problems, /JWT_ACCESS_SECRET must be at least 32/);
    assert.match(problems, /INTERNAL_API_SECRET is missing/);
    assert.match(problems, /FRONTEND_ORIGIN must be an origin only/);
    assert.ok(!problems.includes("short"), "secret value must not appear");
  } finally {
    Object.assign(process.env, saved);
  }
  assert.deepEqual(tokens.validateAuthConfig(), []);
});

// ── Refresh tokens / sessions ──────────────────────────────────────────────

test("refresh token hashing: 32 random bytes, SHA-256 stored, raw never stored", async () => {
  const a = tokens.generateRefreshToken();
  const b = tokens.generateRefreshToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64url").length, 32);
  assert.match(tokens.hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(tokens.hashToken(a), tokens.hashToken(a));

  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const stored = store.sessions[0];
  assert.equal(stored.token_hash, tokens.hashToken(s.refreshToken));
  assert.ok(!JSON.stringify(store.sessions).includes(s.refreshToken), "raw token must not be persisted");
  assert.equal(stored.session_id, s.sessionId);
  const days = (new Date(stored.expires_at) - Date.now()) / tokens.DAY_MS;
  assert.ok(days > 6.99 && days <= 7);
});

test("refresh rotation: old token revoked+replaced, new token same family, sliding expiry capped", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const r = await sessions.rotateSession(s.refreshToken, {});
  assert.ok(r.refreshToken && r.refreshToken !== s.refreshToken);
  assert.equal(r.sessionId, s.sessionId);
  const oldDoc = store.sessions.find((d) => d.token_hash === tokens.hashToken(s.refreshToken));
  const newDoc = store.sessions.find((d) => d.token_hash === tokens.hashToken(r.refreshToken));
  assert.equal(oldDoc.revoke_reason, "rotated");
  assert.equal(oldDoc.replaced_by, newDoc.token_hash);
  assert.equal(newDoc.revoked_at, null);
  assert.equal(newDoc.session_id, s.sessionId);
  const p = tokens.verifyAccessToken(r.accessToken);
  assert.deepEqual([p.sub, p.kind, p.sid, p.tv], ["buyer_A", "buyer", s.sessionId, 0]);

  // Sliding expiry never exceeds the family's absolute cap.
  newDoc.absolute_expires_at = new Date(Date.now() + 60 * 1000);
  const r2 = await sessions.rotateSession(r.refreshToken, {});
  assert.ok(new Date(r2.expiresAt) <= new Date(newDoc.absolute_expires_at));
});

test("refresh rotation grace: a just-rotated token (other tab) gets an access token, no new cookie", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  await sessions.rotateSession(s.refreshToken, {});
  const again = await sessions.rotateSession(s.refreshToken, {});
  assert.equal(again.refreshToken, null);
  assert.ok(tokens.verifyAccessToken(again.accessToken));
});

test("refresh reuse after grace revokes ALL of the user's sessions", async () => {
  const s1 = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const other = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} }); // another device
  await sessions.rotateSession(s1.refreshToken, {});
  store.sessions.find((d) => d.token_hash === tokens.hashToken(s1.refreshToken)).revoked_at =
    new Date(Date.now() - sessions.ROTATION_GRACE_MS - 1000);

  await assert.rejects(sessions.rotateSession(s1.refreshToken, {}), { code: "REFRESH_REUSED" });
  assert.ok(store.sessions.filter((d) => d.user_id === "buyer_A").every((d) => d.revoked_at));
  await assert.rejects(sessions.rotateSession(other.refreshToken, {}), { code: "REFRESH_INVALID" });
});

test("revoked (logged-out) refresh token is rejected", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  assert.equal(await sessions.revokeByRefreshToken(s.refreshToken), true);
  await assert.rejects(sessions.rotateSession(s.refreshToken, {}), { code: "REFRESH_INVALID" });
});

test("expired refresh token and unknown/malformed tokens are rejected", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  store.sessions[0].expires_at = new Date(Date.now() - 1000);
  await assert.rejects(sessions.rotateSession(s.refreshToken, {}), { code: "REFRESH_EXPIRED" });
  await assert.rejects(sessions.rotateSession(tokens.generateRefreshToken(), {}), { code: "REFRESH_INVALID" });
  await assert.rejects(sessions.rotateSession("not-a-token", {}), { code: "REFRESH_INVALID" });
});

test("refresh carries the profile's current token_version; disabled profiles cannot refresh", async () => {
  const v = await sessions.createSession({ kind: "buyer", id: "buyer_V", req: {} });
  const r = await sessions.rotateSession(v.refreshToken, {});
  assert.equal(tokens.verifyAccessToken(r.accessToken).tv, 3);

  const d = await sessions.createSession({ kind: "buyer", id: "buyer_D", req: {} });
  await assert.rejects(sessions.rotateSession(d.refreshToken, {}), { code: "ACCOUNT_DISABLED" });
});

// ── Middleware (dual mode) ─────────────────────────────────────────────────

test("valid Bearer token → req.user from MongoDB profile, without password_hash/auth", async () => {
  const res = await fetch(`${base}/t/buyer`, { headers: bearer(access()) });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.role, "buyer");
  assert.equal(user.id, "buyer_A");
  assert.equal(user.name, "Aisha");
  assert.equal(user.email, "a@example.com");
  assert.equal(user.auth_method, "jwt");
  assert.equal(user.profile.city, "Lahore");
  assert.ok(!("password_hash" in user.profile) && !("auth" in user.profile));
});

test("valid seller and admin Bearer tokens resolve from their own collections", async () => {
  const s = await fetch(`${base}/t/any`, { headers: bearer(access({ sub: "sel_T", kind: "seller" })) });
  const su = (await s.json()).user;
  assert.equal(su.role, "seller");
  assert.ok(!("password_hash" in su.profile));
  const a = await fetch(`${base}/t/admin`, { headers: bearer(access({ sub: "admin_T", kind: "admin" })) });
  assert.equal(a.status, 200);
});

test("invalid Bearer token → 401", async () => {
  const res = await fetch(`${base}/t/any`, { headers: bearer("abc.def.ghi") });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_TOKEN");
});

test("invalid Bearer token must NOT fall back to legacy x-user headers", async () => {
  const forged = jwt.sign({ kind: "admin", tv: 0, sid: "s" }, "attacker-secret-attacker-secret-attacker",
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "admin_T", expiresIn: "15m" });
  for (const path of ["/t/buyer", "/t/admin", "/t/any", "/t/optional"]) {
    const headers = { ...bearer(forged), ...(path === "/t/admin" ? LEGACY_ADMIN : LEGACY_BUYER) };
    const res = await fetch(`${base}${path}`, { headers });
    assert.equal(res.status, 401, `${path} must reject`);
  }
  // Non-Bearer / malformed Authorization headers also never fall back.
  for (const h of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer   ", "Token x.y.z"]) {
    const res = await fetch(`${base}/t/buyer`, { headers: { Authorization: h, ...LEGACY_BUYER } });
    assert.equal(res.status, 401, `"${h}" must reject`);
  }
});

test("expired Bearer token → 401 TOKEN_EXPIRED even when legacy headers are present", async () => {
  const now = Math.floor(Date.now() / 1000);
  const t = jwt.sign({ kind: "buyer", tv: 0, sid: "s", iat: now - 1000, exp: now - 5 }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "buyer_A" });
  const res = await fetch(`${base}/t/buyer`, { headers: { ...bearer(t), ...LEGACY_BUYER } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "TOKEN_EXPIRED");
});

test("token-version mismatch → 401 TOKEN_REVOKED", async () => {
  const res = await fetch(`${base}/t/buyer`, { headers: bearer(access({ sub: "buyer_V", tv: 2 })) });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "TOKEN_REVOKED");
  const ok = await fetch(`${base}/t/buyer`, { headers: bearer(access({ sub: "buyer_V", tv: 3 })) });
  assert.equal(ok.status, 200);
});

test("login_disabled profile and unknown profile are rejected", async () => {
  const d = await fetch(`${base}/t/buyer`, { headers: bearer(access({ sub: "buyer_D" })) });
  assert.equal((await d.json()).code, "ACCOUNT_DISABLED");
  const u = await fetch(`${base}/t/buyer`, { headers: bearer(access({ sub: "buyer_missing" })) });
  assert.equal((await u.json()).code, "PROFILE_NOT_FOUND");
});

test("valid JWT with the wrong role → 403", async () => {
  const res = await fetch(`${base}/t/admin`, { headers: bearer(access()) });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "FORBIDDEN_ROLE");
});

test("Phase 2I: x-user headers are ignored even if AUTH_LEGACY_HEADERS=true is set (no hidden fallback)", async () => {
  process.env.AUTH_LEGACY_HEADERS = "true"; // the old switch no longer exists
  for (const p of ["/t/buyer", "/t/admin", "/t/any"]) {
    const r = await fetch(`${base}${p}`, { headers: { ...LEGACY_BUYER, ...(p === "/t/admin" ? LEGACY_ADMIN : {}) } });
    assert.equal(r.status, 401, p);
  }
  const opt = await (await fetch(`${base}/t/optional`, { headers: LEGACY_ADMIN })).json();
  assert.equal(opt.user, null, "optionalAuth stays anonymous with forged headers");
  // A valid JWT is still the only identity; forged headers cannot change it.
  const r = await fetch(`${base}/t/any`, { headers: { ...bearer(access()), ...LEGACY_ADMIN } });
  const u = (await r.json()).user;
  assert.deepEqual([u.id, u.role, u.auth_method], ["buyer_A", "buyer", "jwt"]);
  assert.equal(require("../../lib/tokens").getAuthConfig().legacyHeaders, undefined, "no legacyHeaders config flag");
});

test("optionalAuth: anonymous continues, valid token attaches user", async () => {
  process.env.AUTH_LEGACY_HEADERS = "false";
  assert.equal((await (await fetch(`${base}/t/optional`)).json()).user, null);
  const r = await fetch(`${base}/t/optional`, { headers: bearer(access()) });
  assert.equal((await r.json()).user.id, "buyer_A");
});

// ── /api/auth endpoints ───────────────────────────────────────────────────

function cookieOf(res) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith("ss_rt="));
  return raw ? raw : null;
}

test("POST /api/auth/refresh: CSRF header + Origin required, cookie flags correct", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const cookie = { Cookie: `ss_rt=${s.refreshToken}` };

  assert.equal((await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: cookie })).status, 403);
  const evil = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...cookie, ...CSRF, Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  const none = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: CSRF });
  assert.equal((await none.json()).code, "NO_SESSION");

  const ok = await fetch(`${base}/api/auth/refresh`, {
    method: "POST", headers: { ...cookie, ...CSRF, Origin: "http://localhost:3000" },
  });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.token_type, "Bearer");
  assert.ok(body.expires_in > 890 && body.expires_in <= 900);
  assert.deepEqual(body.user, { role: "buyer", id: "buyer_A", name: "Aisha", email: "a@example.com", email_verified: true });
  const setCookie = cookieOf(ok);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/api\/auth/);
  assert.doesNotMatch(setCookie, /Secure/i); // development
  assert.ok(!setCookie.includes(s.refreshToken));
});

test("GET /api/auth/me requires a real JWT (legacy headers not accepted)", async () => {
  const legacy = await fetch(`${base}/api/auth/me`, { headers: LEGACY_BUYER });
  assert.equal(legacy.status, 401);
  const res = await fetch(`${base}/api/auth/me`, { headers: bearer(access()) });
  const { user } = await res.json();
  assert.equal(user.id, "buyer_A");
  assert.ok(!("password_hash" in user.profile) && !("auth" in user.profile));
});

test("POST /api/auth/logout revokes the family and clears the cookie; refresh then fails", async () => {
  const s = await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const res = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: `ss_rt=${s.refreshToken}`, ...CSRF } });
  assert.equal(res.status, 200);
  assert.match(cookieOf(res), /ss_rt=;/);
  assert.ok(store.sessions.every((d) => d.revoke_reason === "logout"));
  const again = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { Cookie: `ss_rt=${s.refreshToken}`, ...CSRF } });
  assert.equal(again.status, 401);
});

test("POST /api/auth/logout-all bumps token_version and revokes every session", async () => {
  await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  await sessions.createSession({ kind: "buyer", id: "buyer_A", req: {} });
  const t = access();
  assert.equal((await fetch(`${base}/api/auth/logout-all`, { method: "POST", headers: LEGACY_BUYER })).status, 401);
  const res = await fetch(`${base}/api/auth/logout-all`, { method: "POST", headers: bearer(t) });
  assert.equal(res.status, 200);
  assert.ok(store.sessions.every((d) => d.revoke_reason === "logout_all"));
  assert.deepEqual(store.incs[0].u, { $inc: { "auth.token_version": 1 } });
  // The same access token is now rejected immediately.
  const after = await fetch(`${base}/t/buyer`, { headers: bearer(t) });
  assert.equal((await after.json()).code, "TOKEN_REVOKED");
});

// ── Passwords ──────────────────────────────────────────────────────────────

// Vectors generated with werkzeug 3.0.1 for the dummy password below (not a real credential).
const PW = "Test-Passw0rd!";
const WERKZEUG = {
  scrypt: "scrypt:32768:8:1$9NQewi2OozmzRddv$4c4c900c1992e4ac3a4232ee5c12cd9d18cdb34df1a86e6f981a4d2ce327439f55f0ef1089fc2fe539a18e3e362c64cb2df075b1c149e192e18e70d26702769b",
  pbkdf2: "pbkdf2:sha256:1000$mzL41N9KnfHroDEK$a95fb49abcf7da10101b617ba7047188afb74f20601270df30314049bbeb8a9d",
};

test("passwords: bcrypt hash/verify and rehash signal", async () => {
  const h = await passwords.hashPassword(PW);
  assert.match(h, /^\$2[aby]\$10\$/);
  assert.equal((await passwords.verifyPassword(PW, h)).ok, true);
  assert.equal((await passwords.verifyPassword("wrong", h)).ok, false);
  process.env.BCRYPT_ROUNDS = "12";
  assert.equal((await passwords.verifyPassword(PW, h)).needsRehash, true);
  process.env.BCRYPT_ROUNDS = "10";
});

test("passwords: legacy werkzeug scrypt/pbkdf2 hashes verify and request an upgrade", async () => {
  for (const [name, h] of Object.entries(WERKZEUG)) {
    const ok = await passwords.verifyPassword(PW, h);
    assert.deepEqual(ok, { ok: true, algorithm: "werkzeug", needsRehash: true }, name);
    assert.equal((await passwords.verifyPassword("Wrong-Passw0rd!", h)).ok, false, name);
  }
  for (const bad of [null, "", "garbage", "scrypt:1:1:1$x$zz", "pbkdf2:md999:10$a$ff", "$2a$10$short"]) {
    assert.equal((await passwords.verifyPassword(PW, bad)).ok, false);
  }
});

test("passwords: policy enforces length, byte limit, letter+digit, not-equal-email", () => {
  assert.equal(passwords.validatePasswordPolicy("Abcdefg1").ok, true);
  assert.equal(passwords.validatePasswordPolicy("Abc1").ok, false);
  assert.equal(passwords.validatePasswordPolicy("abcdefgh").ok, false);
  assert.equal(passwords.validatePasswordPolicy("12345678").ok, false);
  assert.equal(passwords.validatePasswordPolicy("a1" + "é".repeat(36)).ok, false); // 74 bytes
  assert.equal(passwords.validatePasswordPolicy("user1@x.com", { email: "USER1@x.com" }).ok, false);
});
