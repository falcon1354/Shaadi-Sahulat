/**
 * Phase 2G — Socket.IO JWT authentication + dispute authorization.
 * Run: npm run test:auth
 *
 * Uses a REAL Socket.IO server (lib/socket.js initSocket) and REAL socket.io-client
 * connections. Profiles / disputes come from in-memory fakes (no database).
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.EMAIL_TRANSPORT = "disabled"; // tests never send/write email
process.env.AUTH_LEGACY_HEADERS = "false";
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");
const tokens = require("../../lib/tokens");

// ── Fakes ───────────────────────────────────────────────────────────────────

const Buyer = require("../../models/Buyer");
const Admin = require("../../models/Admin");
const Dispute = require("../../models/Dispute");
const db = { buyers: [], admins: [], sellers: [], disputes: [] };
const clone = (x) => (x ? structuredClone(x) : null);
const chain = (get) => ({ select() { return this; }, lean: async () => clone(get()) });
Buyer.findOne = (f) => chain(() => db.buyers.find((b) => b.buyer_id === f.buyer_id));
Admin.findOne = (f) => chain(() => db.admins.find((a) => a.admin_id === f.admin_id));
Dispute.findOne = (f) => chain(() => db.disputes.find((d) => d.dispute_id === f.dispute_id));
mongoose.connection.collection = () => ({
  findOne: async (f, o) => {
    const d = clone(db.sellers.find((s) => s.seller_id === f.seller_id));
    if (d && o?.projection?.password_hash === 0) delete d.password_hash;
    return d;
  },
});

function seed() {
  db.buyers = [
    { buyer_id: "buyer_A", name: "Buyer A", email: "a@x.test", password_hash: "h" },
    { buyer_id: "buyer_B", name: "Buyer B", email: "b@x.test", password_hash: "h" },
    { buyer_id: "buyer_V", name: "Versioned", email: "v@x.test", password_hash: "h", auth: { token_version: 3 } },
    { buyer_id: "buyer_D", name: "Disabled", email: "d@x.test", password_hash: "h", auth: { login_disabled: true } },
  ];
  db.admins = [{ admin_id: "admin_1", name: "Admin One", email: "adm@x.test", password_hash: "h" }];
  db.sellers = [
    { seller_id: "sel_A", name: "Seller A", email: "sa@x.test", password_hash: "h" },
    { seller_id: "sel_B", name: "Seller B", email: "sb@x.test", password_hash: "h" },
  ];
  db.disputes = [
    { dispute_id: "DSP-A", buyer_id: "buyer_A", seller_id: "sel_A", status: "OPEN" },
    { dispute_id: "DSP-B", buyer_id: "buyer_B", seller_id: "sel_B", status: "OPEN" },
  ];
}
seed();

// ── Real Socket.IO server ───────────────────────────────────────────────────

const socketLib = require("../../lib/socket");
let port;
const httpServer = http.createServer((req, res) => { res.writeHead(404); res.end(); });
test.before(async () => {
  socketLib.initSocket(httpServer);
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  port = httpServer.address().port;
});
const clients = new Set();
test.afterEach(() => { for (const c of clients) c.disconnect(); clients.clear(); seed(); });
test.after(async () => {
  socketLib.getIO().close();
  await new Promise((r) => httpServer.close(r));
});

const tok = (kind, sub, tv = 0) => tokens.signAccessToken({ sub, kind, tv, sid: "sid-test" });
const sign = (claims, opts = {}, secret = process.env.JWT_ACCESS_SECRET) =>
  jwt.sign(claims, secret, { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, expiresIn: "15m", ...opts });

/** Connect and resolve { socket } on success or { error } (err.data.code) on rejection. */
function connect({ token, query, headers, auth } = {}) {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      path: "/socket.io/",
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      auth: auth !== undefined ? auth : (token !== undefined ? { token } : {}),
      query,
      extraHeaders: headers,
    });
    clients.add(socket);
    socket.on("connect", () => resolve({ socket }));
    socket.on("connect_error", (err) => resolve({ error: err?.data?.code || err.message, socket }));
  });
}
const joinDispute = (socket, id) => new Promise((r) => socket.emit("dispute:join", id, r));
const collect = (socket, event) => { const got = []; socket.on(event, (p) => got.push(p)); return got; };
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

// ── A–H: handshake authentication ───────────────────────────────────────────

test("A. valid JWT → connected as the token's user (buyer, seller, admin)", async () => {
  for (const [kind, sub] of [["buyer", "buyer_A"], ["seller", "sel_A"], ["admin", "admin_1"]]) {
    const { socket, error } = await connect({ token: tok(kind, sub) });
    assert.equal(error, undefined, `${kind} rejected: ${error}`);
    assert.ok(socket.connected);
  }
  const status = socketLib.getStatus();
  assert.deepEqual(status.by_role, { buyer: 1, seller: 1, admin: 1 });
});

test("B. missing token → rejected (AUTH_REQUIRED)", async () => {
  assert.equal((await connect({})).error, "AUTH_REQUIRED");
  assert.equal((await connect({ token: "" })).error, "AUTH_REQUIRED");
});

test("C. invalid / garbage JWT → rejected", async () => {
  assert.equal((await connect({ token: "not.a.jwt" })).error, "INVALID_TOKEN");
  assert.equal((await connect({ token: "x".repeat(5000) })).error, "INVALID_TOKEN");
});

test("D. expired JWT → rejected (TOKEN_EXPIRED)", async () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "s", iat: now - 1000, exp: now - 10 },
    process.env.JWT_ACCESS_SECRET, { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE });
  assert.equal((await connect({ token: expired })).error, "TOKEN_EXPIRED");
});

test("E. wrong signature → rejected", async () => {
  const forged = sign({ kind: "admin", tv: 0, sid: "s" }, { subject: "admin_1" }, "attacker-secret-attacker-secret-attacker-xx");
  assert.equal((await connect({ token: forged })).error, "INVALID_TOKEN");
});

test("F. wrong issuer / audience / algorithm → rejected", async () => {
  assert.equal((await connect({ token: sign({ kind: "buyer", tv: 0, sid: "s" }, { subject: "buyer_A", issuer: "evil" }) })).error, "INVALID_TOKEN");
  assert.equal((await connect({ token: sign({ kind: "buyer", tv: 0, sid: "s" }, { subject: "buyer_A", audience: "other" }) })).error, "INVALID_TOKEN");
  const hs512 = jwt.sign({ kind: "admin", tv: 0, sid: "s" }, process.env.JWT_ACCESS_SECRET,
    { algorithm: "HS512", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, subject: "admin_1", expiresIn: "15m" });
  assert.equal((await connect({ token: hs512 })).error, "INVALID_TOKEN");
});

test("G. stale token_version → rejected (TOKEN_REVOKED); current version accepted", async () => {
  assert.equal((await connect({ token: tok("buyer", "buyer_V", 2) })).error, "TOKEN_REVOKED");
  assert.equal((await connect({ token: tok("buyer", "buyer_V", 3) })).error, undefined);
});

test("H. disabled user / unknown user → rejected", async () => {
  assert.equal((await connect({ token: tok("buyer", "buyer_D") })).error, "ACCOUNT_DISABLED");
  assert.equal((await connect({ token: tok("buyer", "buyer_GHOST") })).error, "PROFILE_NOT_FOUND");
});

// ── I, N: identity cannot come from the client ──────────────────────────────

test("I. query ?id=admin_1&role=admin never authenticates (no token) and never elevates (buyer token)", async () => {
  assert.equal((await connect({ query: { id: "admin_1", role: "admin" } })).error, "AUTH_REQUIRED");
  assert.equal((await connect({ auth: { token: "", role: "admin", id: "admin_1" } })).error, "AUTH_REQUIRED");

  const { socket } = await connect({ token: tok("buyer", "buyer_A"), query: { id: "admin_1", role: "admin" } });
  const notes = collect(socket, "notification:new");
  await settle();
  assert.deepEqual(socketLib.getStatus().by_role, { buyer: 1, seller: 0, admin: 0 });
  socketLib.emitToUser("admin", "admin_1", "notification:new", { to: "admin" });
  socketLib.emitToAdmins("notification:new", { to: "admins" });
  socketLib.emitToUser("buyer", "buyer_A", "notification:new", { to: "buyer_A" });
  await settle();
  assert.deepEqual(notes, [{ to: "buyer_A" }], "only the verified buyer's own room");
});

test("N. verified identity wins: extra auth fields / typing name cannot override socket.user", async () => {
  const a = await connect({ auth: { token: tok("buyer", "buyer_A"), id: "buyer_B", role: "admin" } });
  const s = await connect({ token: tok("seller", "sel_A") });
  assert.deepEqual((await joinDispute(a.socket, "DSP-A")), { ok: true });
  assert.deepEqual((await joinDispute(s.socket, "DSP-A")), { ok: true });
  const typing = collect(s.socket, "dispute:typing");
  a.socket.emit("dispute:typing", { disputeId: "DSP-A", name: "Admin (fake)", role: "admin" });
  await settle();
  assert.deepEqual(typing, [{ name: "Buyer A", role: "buyer" }]);
  // auth.id=buyer_B did not put this socket in buyer_B's room
  const bNotes = collect(a.socket, "notification:new");
  socketLib.emitToUser("buyer", "buyer_B", "notification:new", { to: "buyer_B" });
  await settle();
  assert.deepEqual(bNotes, []);
});

// ── J–M: dispute authorization ──────────────────────────────────────────────

test("J. participants (buyer + seller) join their own dispute and receive its messages", async () => {
  const b = await connect({ token: tok("buyer", "buyer_A") });
  const s = await connect({ token: tok("seller", "sel_A") });
  assert.deepEqual(await joinDispute(b.socket, "DSP-A"), { ok: true });
  assert.deepEqual(await joinDispute(s.socket, "DSP-A"), { ok: true });
  const bMsgs = collect(b.socket, "dispute:message");
  const sMsgs = collect(s.socket, "dispute:message");
  socketLib.emitDisputeMessage("DSP-A", { message: "hi" });
  await settle();
  assert.equal(bMsgs.length, 1);
  assert.equal(sMsgs.length, 1);
});

test("K. unrelated buyer/seller cannot join another dispute and receive nothing from it", async () => {
  const b = await connect({ token: tok("buyer", "buyer_A") });
  const s = await connect({ token: tok("seller", "sel_A") });
  const errors = collect(b.socket, "dispute:error");
  assert.deepEqual(await joinDispute(b.socket, "DSP-B"), { ok: false, error: "FORBIDDEN" });
  assert.deepEqual(await joinDispute(s.socket, "DSP-B"), { ok: false, error: "FORBIDDEN" });
  // unknown dispute gets the SAME answer (no existence leak)
  assert.deepEqual(await joinDispute(b.socket, "DSP-NOPE"), { ok: false, error: "FORBIDDEN" });
  assert.deepEqual(await joinDispute(b.socket, { $ne: null }), { ok: false, error: "INVALID_DISPUTE" });
  const leaked = [...collect(b.socket, "dispute:message"), ...collect(s.socket, "dispute:message")];
  socketLib.emitDisputeMessage("DSP-B", { message: "private" });
  await settle();
  assert.deepEqual(leaked, []);
  assert.ok(errors.length >= 1 && !JSON.stringify(errors).includes("buyer_B"), "no private data in the error");
});

test("L. admin can join any dispute", async () => {
  const a = await connect({ token: tok("admin", "admin_1") });
  assert.deepEqual(await joinDispute(a.socket, "DSP-B"), { ok: true });
  const msgs = collect(a.socket, "dispute:message");
  socketLib.emitDisputeMessage("DSP-B", { message: "x" });
  await settle();
  assert.equal(msgs.length, 1);
});

test("M. dispute:typing from an unauthorized socket is dropped", async () => {
  const owner = await connect({ token: tok("buyer", "buyer_B") });
  assert.deepEqual(await joinDispute(owner.socket, "DSP-B"), { ok: true });
  const typing = collect(owner.socket, "dispute:typing");
  const intruder = await connect({ token: tok("buyer", "buyer_A") });
  await joinDispute(intruder.socket, "DSP-B"); // refused
  intruder.socket.emit("dispute:typing", { disputeId: "DSP-B", name: "spoof" });
  intruder.socket.emit("dispute:typing", "DSP-B");
  intruder.socket.emit("dispute:typing", null);
  await settle();
  assert.deepEqual(typing, []);
});

// ── O: CORS / origin ────────────────────────────────────────────────────────

test("O. only FRONTEND_ORIGIN is allowed (polling CORS + websocket origin check)", async () => {
  const base = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
  const good = await fetch(base, { headers: { Origin: "http://localhost:3000" } });
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const evil = await fetch(base, { headers: { Origin: "https://evil.example" } });
  assert.notEqual(evil.status, 200);
  assert.notEqual(evil.headers.get("access-control-allow-origin"), "*");
  assert.notEqual(evil.headers.get("access-control-allow-origin"), "https://evil.example");
  // A browser-style WebSocket from another origin is refused even with a valid token
  const ws = await connect({ token: tok("buyer", "buyer_A"), headers: { Origin: "https://evil.example" } });
  assert.ok(ws.error, "cross-origin websocket must not connect");
  const ok = await connect({ token: tok("buyer", "buyer_A"), headers: { Origin: "http://localhost:3000" } });
  assert.equal(ok.error, undefined);
});

// ── Session lifetime ────────────────────────────────────────────────────────

test("socket is dropped when its access token expires (client must reconnect with a fresh token)", async () => {
  const shortLived = sign({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "s" }, { expiresIn: 2 });
  const { socket, error } = await connect({ token: shortLived });
  assert.equal(error, undefined);
  const reason = await new Promise((r) => socket.on("disconnect", r));
  assert.equal(reason, "io server disconnect");
});

test("revocation (logout-all / password change) disconnects the account's live sockets", async () => {
  const a1 = await connect({ token: tok("buyer", "buyer_A") });
  const a2 = await connect({ token: tok("buyer", "buyer_A") });
  const b = await connect({ token: tok("buyer", "buyer_B") });
  const reasons = [];
  a1.socket.on("disconnect", (r) => reasons.push(r));
  a2.socket.on("disconnect", (r) => reasons.push(r));
  socketLib.disconnectUser("buyer", "buyer_A");
  await settle();
  assert.deepEqual(reasons, ["io server disconnect", "io server disconnect"]);
  assert.ok(b.socket.connected, "other accounts unaffected");
});

// ── Static checks ───────────────────────────────────────────────────────────

test("no socket code trusts handshake.query / client role-id; no global broadcasts", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "../..");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const sock = strip(fs.readFileSync(path.join(root, "lib/socket.js"), "utf8"));
  assert.ok(!/handshake\.query/.test(sock));
  assert.ok(!/origin:\s*["'`]\*["'`]/.test(sock));
  assert.ok(!/socket\.(role|userId)\b/.test(sock));
  for (const f of ["routes/orders.js", "routes/disputes.js", "lib/notify.js"]) {
    assert.ok(!/\bio\.emit\(/.test(strip(fs.readFileSync(path.join(root, f), "utf8"))), `${f} global broadcast`);
  }
  for (const f of ["src/context/SocketContext.jsx", "src/api/socketClient.js"]) {
    const client = strip(fs.readFileSync(path.join(root, f), "utf8"));
    assert.ok(!/query\s*:/.test(client), `${f} must not send query identity`);
    assert.ok(!/localStorage/.test(client), `${f} must not read localStorage`);
  }
  const sc = strip(fs.readFileSync(path.join(root, "src/api/socketClient.js"), "utf8"));
  assert.ok(/auth:\s*\(cb\)\s*=>\s*cb\(\{\s*token:\s*getAccessToken\(\)/.test(sc), "client sends the in-memory JWT");
});
