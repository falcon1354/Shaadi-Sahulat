/**
 * OTP-first registration (buyer + seller), OTP email, SMTP configuration and the
 * forgot-password regression.
 * Run: npm run test:auth
 *
 * Isolated: Buyer/Admin/sellers/auth_sessions/pending_registrations are in-memory
 * fakes; Flask is a local stub; mail goes to an in-memory transport (the console
 * transport test writes to a temporary folder). No database, no real email.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.REFRESH_TTL_DAYS = "7";
process.env.REFRESH_ABSOLUTE_DAYS = "30";
process.env.BCRYPT_ROUNDS = "10";
process.env.EMAIL_TRANSPORT = "disabled";
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const tokens = require("../../lib/tokens");
const otpLib = require("../../lib/registrationOtp");
const mailer = require("../../lib/mailer");
const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const AuthSession = require("../../models/AuthSession");
const PendingRegistration = require("../../models/PendingRegistration");
const { installPendingFake, captureMail } = require("./_registrationFakes");

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
function matches(doc, f) {
  return Object.entries(f).every(([k, v]) => {
    const actual = getPath(doc, k);
    if (v === null) return actual == null;
    if (v && typeof v === "object" && !(v instanceof Date) && "$gt" in v) return actual != null && new Date(actual) > new Date(v.$gt);
    return actual !== undefined && String(actual) === String(v);
  });
}
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });
for (const [Model, key] of [[Buyer, "buyers"], [Admin, "admins"]]) {
  Model.findOne = (f) => chain(() => db[key].find((d) => matches(d, f)));
  Model.updateOne = async (f, u) => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); };
  Model.findOneAndUpdate = (f, u) => chain(() => { const d = db[key].find((x) => matches(x, f)); if (d) applyUpdate(d, u); return d; });
}
Buyer.create = async (data) => {
  const doc = new Buyer(data);
  const err = doc.validateSync();
  if (err) throw err;
  if (db.buyers.some((b) => b.email === data.email)) throw Object.assign(new Error("dup"), { code: 11000 });
  db.buyers.push(clone(doc.toObject()));
  return doc;
};
const realCollection = mongoose.connection.collection.bind(mongoose.connection);
mongoose.connection.collection = (name) => {
  if (name !== "sellers") return realCollection(name);
  return {
    findOne: async (f, o) => { const d = clone(db.sellers.find((x) => matches(x, f))); if (d && o?.projection?.password_hash === 0) delete d.password_hash; return d; },
    updateOne: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); },
    findOneAndUpdate: async (f, u) => { const d = db.sellers.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return clone(d); },
  };
};
AuthSession.create = async (data) => { const d = { _id: String(seq++), revoked_at: null, revoke_reason: null, replaced_by: null, ...data }; db.sessions.push(d); return { ...d }; };
AuthSession.findOne = async (f) => clone(db.sessions.find((d) => matches(d, f)));
AuthSession.findOneAndUpdate = async (f, u) => { const d = db.sessions.find((x) => matches(x, f)); if (!d) return null; applyUpdate(d, u); return clone(d); };
AuthSession.updateMany = async (f, u) => { for (const d of db.sessions.filter((x) => matches(x, f))) applyUpdate(d, u); };

const pending = installPendingFake();
const mail = captureMail();

const PW = "Str0ng-Passw0rd"; // dummy test password
const BC = bcrypt.hashSync(PW, 10);
function reset() {
  db.sessions = [];
  db.admins = [{ admin_id: "admin_001", name: "Admin", email: "admin@shaadisahulat.com", password_hash: BC }];
  db.buyers = [{ buyer_id: "buyer_old", name: "Old", email: "old@x.test", password_hash: BC, auth: { token_version: 0, email_verified: true } }];
  db.sellers = [{ seller_id: "sel_old", name: "Old Seller", email: "oldseller@x.test", password_hash: BC }];
  pending.length = 0;
  mail.mails.length = 0;
  flaskCalls.length = 0;
}

// ── Flask stub (seller internal create) ─────────────────────────────────────

const flaskCalls = [];
const flask = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : null;
    flaskCalls.push({ url: req.url, headers: req.headers, body });
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url !== "/seller/internal/create") return send(404, {});
    if (req.headers["x-internal-secret"] !== process.env.INTERNAL_API_SECRET) return send(401, { success: false });
    const sellerType = body.seller_type === "company" ? "company" : "individual";
    const doc = { seller_id: `sel_${String(seq++).padStart(12, "0")}`, name: body.name, email: body.email, phone: body.phone, city: body.city,
      password_hash: body.password_hash, seller_type: sellerType, max_listings: sellerType === "company" ? null : 5, auth: body.auth };
    db.sellers.push(clone(doc));
    const { password_hash, auth, ...pub } = doc;
    return send(201, { success: true, seller: pub });
  });
});

// ── App ─────────────────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", "loopback"); // each test uses its own client IP for the rate limiters
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", require("../../routes/auth"));
let base;
const server = app.listen(0);
test.before(async () => {
  await new Promise((r) => flask.listen(0, "127.0.0.1", r));
  process.env.VISUAL_ML_URL = `http://127.0.0.1:${flask.address().port}`;
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); flask.close(); mailer.setMailTransport(null); });
test.beforeEach(reset);
reset();

let ipSeq = 1;
const freshIp = () => `10.30.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const CSRF = { "Content-Type": "application/json", "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
async function post(p, body, ip = freshIp()) {
  const res = await fetch(`${base}/api/auth${p}`, { method: "POST", headers: { ...CSRF, "X-Forwarded-For": ip }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, res };
}
const BUYER = (email = "sara@x.test") => ({ name: "Sara Khan", email, password: PW, phone: "0300-1234567", city: "Lahore" });
const SELLER = (email = "shop@x.test") => ({ name: "Bridal House", email, password: PW, phone: "0300-0000000", city: "Karachi", seller_type: "company" });
const PORTALS = { buyer: BUYER, seller: SELLER };
const accountFor = (portal, email) => (portal === "buyer" ? db.buyers : db.sellers).find((d) => d.email === email);

async function start(portal, email) {
  const r = await post(`/${portal}/register`, PORTALS[portal](email));
  await mail.settle();
  return { ...r, otp: mail.otpFor(email), token: r.body?.registration_token };
}
const verify = (portal, email, otp, token, ip) => post("/register/verify", { portal, email, otp, registration_token: token }, ip);
const resend = (portal, email, token, ip) => post("/register/resend", { portal, email, registration_token: token }, ip);
const wrongOtp = (otp) => String((Number(otp) + 1) % 900000 + 100000);
const rowOf = (email) => pending.find((p) => p.normalized_email === email);

// ════════════════════════════════════════════════════════════════════════════
// Buyer + seller: the complete OTP flow (same assertions for both portals)
// ════════════════════════════════════════════════════════════════════════════

for (const portal of ["buyer", "seller"]) {
  const E = (tag) => `${tag}.${portal}@x.test`;

  test(`${portal}: register creates a pending record only — NO ${portal} account, no session, no Flask call`, async () => {
    const r = await start(portal, E("a"));
    assert.equal(r.status, 202);
    assert.equal(r.body.verification_required, true);
    assert.equal(r.body.portal, portal);
    assert.match(r.body.registration_token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.body.otp_expires_in, 600);
    assert.equal(accountFor(portal, E("a")), undefined);
    assert.equal(db.sessions.length, 0);
    assert.equal(flaskCalls.length, 0);
    const row = rowOf(E("a"));
    assert.ok(row);
    assert.equal(row.portal, portal);
    assert.equal(row.otp_attempts, 0);
    assert.ok(row.expires_at > new Date(Date.now() + 23 * 3600e3), "TTL ~24 h for the pending record");
    const ttl = new Date(row.otp_expires_at) - Date.now();
    assert.ok(ttl > 9 * 60e3 && ttl <= 10 * 60e3, "OTP valid ~10 minutes");
  });

  test(`${portal}: OTP is 6 digits, only its HMAC is stored; password only as bcrypt; nothing secret in the response`, async () => {
    const r = await start(portal, E("b"));
    assert.match(r.otp, /^\d{6}$/);
    const row = rowOf(E("b"));
    const stored = JSON.stringify(row);
    assert.ok(!stored.includes(r.otp), "plaintext OTP never stored");
    assert.ok(!stored.includes(PW), "plaintext password never stored");
    assert.match(row.otp_hash, /^[0-9a-f]{64}$/);
    assert.equal(row.otp_hash, otpLib.hashOtp(portal, E("b"), r.otp));
    assert.notEqual(row.otp_hash, require("crypto").createHash("sha256").update(r.otp).digest("hex"), "keyed HMAC, not a plain hash");
    assert.ok(await bcrypt.compare(PW, row.password_hash));
    assert.notEqual(row.registration_token_hash, r.token, "registration token stored hashed");
    for (const secret of [r.otp, "password_hash", "otp_hash", "$2b$", "$2a$"]) assert.ok(!r.text.includes(secret), secret);
  });

  test(`${portal}: correct OTP creates the account (verified), signs in, removes the pending record; login works`, async () => {
    const r = await start(portal, E("c"));
    const v = await verify(portal, E("c"), r.otp, r.token);
    assert.equal(v.status, 201);
    const acct = accountFor(portal, E("c"));
    assert.ok(acct, "account now exists");
    assert.equal(acct.auth.email_verified, true);
    assert.ok(await bcrypt.compare(PW, acct.password_hash));
    const p = tokens.verifyAccessToken(v.body.access_token);
    assert.equal(p.kind, portal);
    assert.equal(v.body.user.email_verified, true);
    assert.ok(v.res.headers.getSetCookie().some((c) => c.startsWith("ss_rt=")), "refresh cookie set");
    assert.ok(!v.text.includes("password_hash") && !/"auth"\s*:/.test(v.text));
    assert.equal(rowOf(E("c")), undefined, "pending record removed");
    const login = await post("/login", { portal, email: E("c"), password: PW });
    assert.equal(login.status, 200);
  });

  test(`${portal}: a used OTP cannot be replayed`, async () => {
    const r = await start(portal, E("d"));
    assert.equal((await verify(portal, E("d"), r.otp, r.token)).status, 201);
    const again = await verify(portal, E("d"), r.otp, r.token);
    assert.equal(again.status, 400);
    assert.equal((portal === "buyer" ? db.buyers : db.sellers).filter((d) => d.email === E("d")).length, 1);
  });

  test(`${portal}: wrong OTP rejected (attempts counted), no account`, async () => {
    const r = await start(portal, E("e"));
    const v = await verify(portal, E("e"), wrongOtp(r.otp), r.token);
    assert.equal(v.status, 400);
    assert.equal(v.body.code, "INVALID_OTP");
    assert.equal(v.body.attempts_remaining, 4);
    assert.equal(rowOf(E("e")).otp_attempts, 1);
    assert.equal(accountFor(portal, E("e")), undefined);
    for (const bad of ["12345", "1234567", "abcdef", "", undefined, 123456, { $ne: "" }]) {
      assert.equal((await verify(portal, E("e"), bad, r.token)).status, 400, JSON.stringify(bad));
    }
    assert.equal(rowOf(E("e")).otp_attempts, 1, "malformed input does not consume attempts");
    assert.equal((await verify(portal, E("e"), r.otp, r.token)).status, 201, "correct code still works");
  });

  test(`${portal}: expired OTP rejected`, async () => {
    const r = await start(portal, E("f"));
    rowOf(E("f")).otp_expires_at = new Date(Date.now() - 1000);
    const v = await verify(portal, E("f"), r.otp, r.token);
    assert.equal(v.status, 400);
    assert.equal(v.body.code, "OTP_EXPIRED");
    assert.equal(accountFor(portal, E("f")), undefined);
  });

  test(`${portal}: too many attempts → 429 and the code is dead, even the correct one`, async () => {
    const r = await start(portal, E("g"));
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await verify(portal, E("g"), wrongOtp(r.otp), r.token)).status);
    assert.deepEqual(codes, [400, 400, 400, 400, 429]);
    const v = await verify(portal, E("g"), r.otp, r.token);
    assert.equal(v.status, 400, "the code was invalidated");
    assert.equal(rowOf(E("g")).otp_hash, undefined);
    assert.equal(accountFor(portal, E("g")), undefined);
  });

  test(`${portal}: resend after the cooldown issues a new OTP and invalidates the old one`, async () => {
    const r = await start(portal, E("h"));
    rowOf(E("h")).last_otp_sent_at = new Date(Date.now() - 61e3);
    rowOf(E("h")).otp_attempts = 3;
    const rs = await resend(portal, E("h"), r.token);
    assert.equal(rs.status, 200);
    await mail.settle();
    const fresh = mail.otpFor(E("h"));
    assert.match(fresh, /^\d{6}$/);
    assert.equal(rowOf(E("h")).otp_attempts, 0, "attempts reset");
    if (fresh !== r.otp) {
      assert.equal((await verify(portal, E("h"), r.otp, r.token)).status, 400, "old code no longer works");
    }
    assert.equal((await verify(portal, E("h"), fresh, r.token)).status, 201);
  });

  test(`${portal}: resend cooldown enforced`, async () => {
    const r = await start(portal, E("i"));
    const rs = await resend(portal, E("i"), r.token);
    assert.equal(rs.status, 429);
    assert.equal(rs.body.code, "RESEND_COOLDOWN");
    assert.ok(rs.body.retry_after > 0 && rs.body.retry_after <= 60);
    await mail.settle();
    assert.equal(mail.mails.filter((m) => m.to === E("i")).length, 1, "no second email");
  });

  test(`${portal}: email taken by another role meanwhile → re-checked at verify, 409, nothing created`, async () => {
    const r = await start(portal, E("j"));
    db.admins.push({ admin_id: "admin_late", name: "Late", email: E("j"), password_hash: BC });
    const v = await verify(portal, E("j"), r.otp, r.token);
    assert.equal(v.status, 409);
    assert.equal(v.body.code, "EMAIL_IN_USE");
    assert.equal(accountFor(portal, E("j")), undefined);
    assert.equal(rowOf(E("j")), undefined);
    assert.equal(flaskCalls.length, 0);
  });

  test(`${portal}: the OTP only works with the registration token of the browser that registered`, async () => {
    const r = await start(portal, E("k"));
    const other = require("crypto").randomBytes(32).toString("base64url");
    const v = await verify(portal, E("k"), r.otp, other);
    assert.equal(v.status, 400);
    assert.equal(rowOf(E("k")).otp_attempts, 0, "wrong token does not even consume an attempt");
    assert.equal((await verify(portal === "buyer" ? "seller" : "buyer", E("k"), r.otp, r.token)).status, 400, "portal is bound");
    assert.equal((await verify(portal, E("k"), r.otp, r.token)).status, 201);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Cross-cutting
// ════════════════════════════════════════════════════════════════════════════

test("anti-hijack: re-submitting the form for someone's email replaces the sign-up; the old code/token stop working", async () => {
  const victim = await start("buyer", "victim@x.test");
  const attacker = await post("/buyer/register", { ...BUYER("victim@x.test"), password: "Attack3r-Passw0rd" });
  assert.equal(attacker.status, 202);
  await mail.settle();
  const secondCode = mail.otpFor("victim@x.test"); // lands in the VICTIM's mailbox
  // The victim still holds only their own (now superseded) token → cannot be tricked into
  // creating the attacker's account with the new code.
  assert.equal((await verify("buyer", "victim@x.test", secondCode, victim.token)).status, 400);
  assert.equal((await verify("buyer", "victim@x.test", victim.otp, victim.token)).status, 400);
  assert.equal(db.buyers.find((b) => b.email === "victim@x.test"), undefined, "nothing created");
});

test("existing accounts (any role, normalized) get the same 202 and no pending record / OTP; admin signup does not exist", async () => {
  const ref = await post("/buyer/register", BUYER("fresh-ref@x.test"));
  for (const [portal, email] of [["buyer", "OLD@x.test"], ["seller", "old@x.test"], ["buyer", " oldseller@x.test "], ["seller", "admin@shaadisahulat.com"]]) {
    const r = await post(`/${portal}/register`, PORTALS[portal](email));
    assert.equal(r.status, 202, email);
    assert.deepEqual(Object.keys(r.body).sort(), Object.keys(ref.body).sort());
    assert.equal(rowOf(email.trim().toLowerCase()), undefined);
  }
  await mail.settle();
  assert.ok(mail.mails.filter((m) => /already exists/.test(m.text)).length >= 4);
  assert.equal(mail.mails.filter((m) => /verification code is/.test(m.text)).length, 1, "only the genuine sign-up got a code");
  for (const p of ["/admin/register", "/register"]) assert.equal((await post(p, { email: "x@x.test", password: PW })).status, 404, p);
  assert.equal((await verify("admin", "admin@shaadisahulat.com", "123456", ref.body.registration_token)).status, 400);
});

test("concurrent verification with the right code creates exactly one account", async () => {
  const r = await start("buyer", "race@x.test");
  const results = await Promise.all([1, 2, 3].map(() => verify("buyer", "race@x.test", r.otp, r.token)));
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 400, 400]);
  assert.equal(db.buyers.filter((b) => b.email === "race@x.test").length, 1);
});

test("resend: generic answer for unknown / mismatched sign-ups (no enumeration), rate limited per address", async () => {
  const token = require("crypto").randomBytes(32).toString("base64url");
  for (const email of ["nobody@x.test", "old@x.test"]) {
    const r = await resend("buyer", email, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  }
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await resend("buyer", "spam@x.test", token, ip)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  await mail.settle();
  assert.equal(mail.mails.length, 0, "nothing sent for unknown sign-ups");
});

test("OTP generation uses crypto.randomInt and always yields exactly 6 digits", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../lib/registrationOtp.js"), "utf8");
  assert.match(src, /crypto\.randomInt\(100000, 1000000\)/);
  assert.ok(!/Math\.random/.test(src));
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const c = otpLib.generateOtp(); assert.match(c, /^\d{6}$/); seen.add(c); }
  assert.ok(seen.size > 1900, "no obvious repetition");
  assert.equal(otpLib.otpMatches(otpLib.hashOtp("buyer", "a@x.test", "123456"), "buyer", "a@x.test", "123456"), true);
  assert.equal(otpLib.otpMatches(otpLib.hashOtp("buyer", "a@x.test", "123456"), "seller", "a@x.test", "123456"), false, "bound to portal");
  assert.equal(otpLib.otpMatches(otpLib.hashOtp("buyer", "a@x.test", "123456"), "buyer", "b@x.test", "123456"), false, "bound to email");
});

test("pending registrations expire automatically (TTL index on expires_at)", () => {
  const ttl = PendingRegistration.schema.indexes().find(([fields]) => fields.expires_at === 1);
  assert.ok(ttl, "TTL index present");
  assert.equal(ttl[1].expireAfterSeconds, 0);
  const unique = PendingRegistration.schema.path("normalized_email").options.unique;
  assert.equal(unique, true);
});

// ════════════════════════════════════════════════════════════════════════════
// Email
// ════════════════════════════════════════════════════════════════════════════

test("OTP email: subject, 6-digit code, expiry, do-not-share warning; no password or secrets", async () => {
  const r = await start("buyer", "mailcheck@x.test");
  const m = mail.mails.find((x) => x.to === "mailcheck@x.test");
  assert.equal(m.subject, "ShaadiSahulat: Verify your email");
  for (const body of [m.text, m.html]) {
    assert.ok(body.includes(r.otp));
    assert.match(body, /10 minutes/);
    assert.match(body, /Never share this code/);
    assert.ok(body.includes("ShaadiSahulat"));
    assert.ok(!body.includes(PW) && !body.includes("$2") && !body.includes(r.token));
  }
});

test("console transport writes the OTP email as an .eml file (masked console line, no code in logs)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-otp-mail-"));
  const logs = [];
  const orig = console.log;
  mailer.setMailTransport(null);
  process.env.EMAIL_TRANSPORT = "console";
  process.env.MAIL_OUTBOX_DIR = dir;
  console.log = (...a) => { logs.push(a.join(" ")); };
  try {
    const { registrationOtpEmail } = require("../../lib/emailTemplates");
    await mailer.sendMail({ to: "console@x.test", ...registrationOtpEmail({ name: "C", otp: "482913", ttlMinutes: 10 }) });
  } finally {
    console.log = orig;
    process.env.EMAIL_TRANSPORT = "disabled";
    delete process.env.MAIL_OUTBOX_DIR;
    mailer.setMailTransport(async (m) => { mail.mails.push(m); });
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".eml"));
  assert.equal(files.length, 1);
  const eml = fs.readFileSync(path.join(dir, files[0]), "utf8");
  assert.match(eml, /Subject: ShaadiSahulat: Verify your email/);
  assert.match(eml, /To: console@x\.test/);
  assert.ok(eml.includes("482913"));
  assert.ok(logs.some((l) => l.includes("co***@x.test")), "console shows a masked recipient");
  assert.ok(!logs.some((l) => l.includes("482913")), "the code never appears in logs");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("SMTP transport options: 465 = TLS, 587 = enforced STARTTLS, Gmail app-password spaces removed, no credential in descriptions", () => {
  const gmail465 = mailer.smtpOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "abcd efgh ijkl mnop" });
  assert.deepEqual([gmail465.host, gmail465.port, gmail465.secure, gmail465.requireTLS], ["smtp.gmail.com", 465, true, false]);
  assert.equal(gmail465.auth.pass, "abcdefghijklmnop");
  const gmail587 = mailer.smtpOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "x" });
  assert.deepEqual([gmail587.port, gmail587.secure, gmail587.requireTLS], [587, false, true]);
  assert.equal(mailer.smtpOptions({ SMTP_HOST: "mail.example.com", SMTP_PORT: "465" }).secure, true, "465 defaults to TLS");
  assert.equal(mailer.smtpOptions({ SMTP_HOST: "mail.example.com", SMTP_PASSWORD: "a b" }).auth, undefined, "no auth without a user");
  assert.throws(() => mailer.smtpOptions({}), /SMTP_HOST/);
  const desc = mailer.describeSmtp({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_USER: "someone@gmail.com", SMTP_PASSWORD: "TopSecretPass" });
  assert.ok(!desc.includes("TopSecretPass") && !desc.includes("someone@gmail.com"));
  const example = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf8");
  for (const k of ["EMAIL_TRANSPORT=", "SMTP_HOST=", "SMTP_PORT=", "SMTP_SECURE=", "SMTP_USER=", "SMTP_PASSWORD=", "SMTP_FROM="]) assert.ok(example.includes(k), k);
  assert.match(example, /^SMTP_PASSWORD=$/m, "no SMTP password in .env.example");
  assert.match(example, /^SMTP_USER=$/m);
});

test("SMTP transport sends through nodemailer with the configured options (stubbed network)", async () => {
  const nodemailer = require("nodemailer");
  const real = nodemailer.createTransport;
  const sent = [];
  let opts = null;
  nodemailer.createTransport = (o) => { opts = o; return { sendMail: async (m) => { sent.push(m); return { messageId: "x", accepted: [m.to], rejected: [], response: "250 2.0.0 OK" }; }, verify: async () => true }; };
  const env = { ...process.env };
  Object.assign(process.env, { EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "app pass word", SMTP_FROM: "ShaadiSahulat <me@gmail.com>" });
  mailer.setMailTransport(null);
  try {
    const { registrationOtpEmail } = require("../../lib/emailTemplates");
    const r = await mailer.sendMail({ to: "real@x.test", ...registrationOtpEmail({ name: "R", otp: "654321", ttlMinutes: 10 }) });
    assert.equal(r.delivered, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, "ShaadiSahulat <me@gmail.com>");
    assert.ok(sent[0].text.includes("654321"));
    assert.deepEqual([opts.host, opts.port, opts.secure], ["smtp.gmail.com", 465, true]);
    assert.equal(r.transport, "smtp");
    const v = await mailer.verifyTransport();
    assert.equal(v.ok, true);
    assert.equal(v.status, "SMTP authentication successful");
    assert.ok(!v.detail.includes("app pass word") && !v.detail.includes("apppassword"));
  } finally {
    nodemailer.createTransport = real;
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
    mailer.setMailTransport(async (m) => { mail.mails.push(m); });
  }
});

test("mailer: port decides TLS mode (465 TLS / 587 STARTTLS) even if SMTP_SECURE disagrees; sender defaults to SMTP_USER", () => {
  assert.equal(mailer.smtpOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "false" }).secure, true);
  const o587 = mailer.smtpOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_SECURE: "true" });
  assert.deepEqual([o587.secure, o587.requireTLS], [false, true]);
  assert.equal(mailer.smtpOptions({ SMTP_HOST: "mail.example.com", SMTP_PORT: "2465", SMTP_SECURE: "true" }).secure, true, "other ports follow SMTP_SECURE");
  assert.equal(mailer.fromAddress({ EMAIL_TRANSPORT: "smtp", SMTP_USER: "me@gmail.com" }), "ShaadiSahulat <me@gmail.com>");
  assert.equal(mailer.fromAddress({ EMAIL_TRANSPORT: "smtp", SMTP_USER: "me@gmail.com", SMTP_FROM: "Shop <me@gmail.com>" }), "Shop <me@gmail.com>");
});

test("mailer: configuration status names missing variables and warns — never values", () => {
  const none = mailer.smtpConfigStatus({ EMAIL_TRANSPORT: "smtp" });
  assert.deepEqual([none.ok, none.missing], [false, ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]]);
  const bad = mailer.smtpConfigStatus({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "false", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "MyRealGmailPass1!", SMTP_FROM: "X <other@gmail.com>" });
  assert.equal(bad.ok, true);
  assert.equal(bad.warnings.length, 3);
  assert.ok(bad.warnings.some((w) => /App Password/.test(w)) && bad.warnings.some((w) => /SMTP_FROM/.test(w)) && bad.warnings.some((w) => /465/.test(w)));
  assert.ok(!JSON.stringify(bad).includes("MyRealGmailPass1!") && !JSON.stringify(bad).includes("me@gmail.com"), "no values in the status");
  const good = mailer.smtpConfigStatus({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "abcd efgh ijkl mnop", SMTP_FROM: "ShaadiSahulat <me@gmail.com>" });
  assert.deepEqual(good, { ok: true, missing: [], warnings: [] });
});

test("mailer: startup status strings — console is 'NOT delivered', missing config, invalid transport", async () => {
  assert.equal(mailer.transportMode({ EMAIL_TRANSPORT: "console" }), "console");
  assert.equal(mailer.transportMode({ EMAIL_TRANSPORT: "SMTP" }), "smtp");
  assert.equal(mailer.transportMode({}), "invalid", "unset is not silently console");
  assert.equal(mailer.transportMode({ EMAIL_TRANSPORT: "stmp" }), "invalid");
  const c = await mailer.verifyTransport({ EMAIL_TRANSPORT: "console" });
  assert.deepEqual([c.ok, c.status], [true, "Console transport - NOT delivered"]);
  const miss = await mailer.verifyTransport({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.gmail.com" });
  assert.deepEqual([miss.ok, miss.status], [false, "Missing SMTP configuration"]);
  assert.match(miss.detail, /SMTP_USER, SMTP_PASSWORD/);
  const inv = await mailer.verifyTransport({});
  assert.deepEqual([inv.ok, inv.status], [false, "Invalid EMAIL_TRANSPORT"]);
});

test("mailer: SMTP mode never falls back to the console outbox; failures are reported, not swallowed as success", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-nofallback-"));
  const env = { ...process.env };
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  mailer.setMailTransport(null);
  try {
    Object.assign(process.env, { EMAIL_TRANSPORT: "smtp", MAIL_OUTBOX_DIR: dir });
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PORT", "SMTP_FROM", "SMTP_SECURE"]) delete process.env[k];
    await assert.rejects(() => mailer.sendMail({ to: "x@x.test", subject: "s", text: "t" }), { code: "ECONFIG" });
    const safe = await mailer.sendMailSafely({ to: "someone@x.test", subject: "s", text: "secret-body-482913" });
    assert.equal(safe.delivered, false);
    process.env.EMAIL_TRANSPORT = "smtpp"; // typo
    await assert.rejects(() => mailer.sendMail({ to: "x@x.test", subject: "s", text: "t" }), { code: "ECONFIG" });
    assert.equal(fs.readdirSync(dir).length, 0, "nothing was written to the console outbox");
    assert.ok(errors.some((e) => /delivery FAILED/.test(e) && /so\*\*\*@x\.test/.test(e)), "failure logged with a masked recipient");
    assert.ok(!errors.some((e) => e.includes("secret-body-482913") || e.includes("someone@x.test")), "no body / full address in logs");
  } finally {
    console.error = origErr;
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
    mailer.setMailTransport(async (m) => { mail.mails.push(m); });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mailer: an email counts as delivered only if the SMTP server accepted the recipient", async () => {
  const nodemailer = require("nodemailer");
  const real = nodemailer.createTransport;
  const env = { ...process.env };
  let mode = "reject";
  // fresh module instance so no cached transporter is reused
  delete require.cache[require.resolve("../../lib/mailer")];
  const fresh = require("../../lib/mailer");
  nodemailer.createTransport = () => ({
    verify: async () => { throw Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN", response: "535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8 https://support.google.com/mail/?p=BadCredentials" }); },
    sendMail: async (m) => {
      if (mode === "reject") return { accepted: [], rejected: [m.to], response: "550 5.1.1 The email account that you tried to reach does not exist" };
      if (mode === "throw") throw Object.assign(new Error("Message failed"), { code: "EMESSAGE", responseCode: 550, command: "DATA", response: "550 5.7.1 Message rejected for victim@gmail.com" });
      return { accepted: [m.to], rejected: [], response: "250 2.0.0 OK  1700000000 abc - gsmtp", messageId: "<id@x>" };
    },
  });
  Object.assign(process.env, { EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "abcdefghijklmnop" });
  const logs = [];
  const origLog = console.log; const origErr = console.error;
  console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  try {
    await assert.rejects(() => fresh.sendMail({ to: "nobody@gmail.com", subject: "s", text: "t" }), { code: "EENVELOPE" });
    mode = "throw";
    const failed = await fresh.sendMailSafely({ to: "victim@gmail.com", subject: "s", text: "t" });
    assert.equal(failed.delivered, false);
    mode = "ok";
    const ok = await fresh.sendMail({ to: "real@gmail.com", subject: "s", text: "t" });
    assert.deepEqual([ok.delivered, ok.transport], [true, "smtp"]);
    const v = await fresh.verifyTransport();
    assert.deepEqual([v.ok, v.status], [false, "SMTP authentication failed"]);
    assert.match(v.detail, /535/);
    assert.match(v.detail, /Username and Password not accepted/);
    assert.match(v.detail, /App Password/);
  } finally {
    console.log = origLog; console.error = origErr;
    nodemailer.createTransport = real;
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[require.resolve("../../lib/mailer")];
    require.cache[require.resolve("../../lib/mailer")] = { id: require.resolve("../../lib/mailer"), filename: require.resolve("../../lib/mailer"), loaded: true, exports: mailer };
  }
  const all = logs.join("\n");
  assert.ok(/550 DATA|EMESSAGE 550 DATA/.test(all), "the SMTP rejection reason is logged");
  assert.ok(!all.includes("abcdefghijklmnop"), "password never logged");
  assert.ok(!all.includes("victim@gmail.com") && !all.includes("real@gmail.com") && !all.includes("me@gmail.com"), "addresses masked in logs");
  assert.ok(logs.some((l) => /sent "s" to re\*\*\*@gmail\.com via SMTP/.test(l) && /250 2\.0\.0 OK/.test(l)), "accepted send logged with the server reply");
});

test("send-test-email script: recipient from argv only; reports safely; non-zero exit on failure", () => {
  const { spawnSync } = require("node:child_process");
  const script = path.join(__dirname, "../../scripts/send-test-email.js");
  const src = fs.readFileSync(script, "utf8");
  assert.ok(!/@gmail\.com/.test(src), "no hardcoded recipient");
  assert.match(src, /process\.argv\[2\]/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-script-"));
  const run = (args, extra) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, MAIL_OUTBOX_DIR: dir, SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", ...extra } });
  const usage = run([], { EMAIL_TRANSPORT: "console" });
  assert.equal(usage.status, 1);
  const consoleRun = run(["dev@example.com"], { EMAIL_TRANSPORT: "console" });
  assert.equal(consoleRun.status, 0);
  assert.match(consoleRun.stdout, /Console transport - NOT delivered/);
  assert.equal(fs.readdirSync(dir).length, 1);
  const missing = run(["dev@example.com"], { EMAIL_TRANSPORT: "smtp" });
  assert.equal(missing.status, 2);
  assert.match(missing.stdout + missing.stderr, /Missing SMTP configuration/);
  assert.match(missing.stdout + missing.stderr, /SMTP_HOST, SMTP_USER, SMTP_PASSWORD/);
  assert.equal(fs.readdirSync(dir).length, 1, "SMTP mode did not fall back to the outbox");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════════════════════════
// Forgot password (unchanged link flow)
// ════════════════════════════════════════════════════════════════════════════

test("forgot password: reset link email still sent; token one-time; unknown email gets the same answer", async () => {
  const known = await post("/forgot-password", { email: "old@x.test" });
  const unknown = await post("/forgot-password", { email: "nobody-here@x.test" });
  assert.deepEqual([known.status, unknown.status], [200, 200]);
  assert.deepEqual(known.body, unknown.body, "no enumeration");
  await new Promise((r) => setTimeout(r, 200));
  const m = mail.mails.find((x) => x.to === "old@x.test");
  assert.ok(m, "reset email sent");
  assert.equal(mail.mails.filter((x) => x.to === "nobody-here@x.test").length, 0);
  const raw = m.text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)[1];
  const first = await post("/reset-password", { token: raw, password: "N3w-Passw0rd!" });
  assert.equal(first.status, 200);
  assert.equal((await post("/reset-password", { token: raw, password: "An0ther-Passw0rd" })).status, 400, "one-time");
  assert.equal((await post("/login", { portal: "buyer", email: "old@x.test", password: "N3w-Passw0rd!" })).status, 200);
});
