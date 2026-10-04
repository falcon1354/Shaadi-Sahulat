/**
 * Phase 2G — frontend Socket.IO client behaviour.
 * Run: npm run test:frontend
 *
 * The real src/api/socketClient.js + src/api/http.js (compiled with esbuild) connect
 * to a REAL Socket.IO server (lib/socket.js) in this process. Profiles come from
 * in-memory fakes; /api/auth/refresh is a stubbed fetch. No network / database.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.EMAIL_TRANSPORT = "disabled"; // tests never send/write email
process.env.AUTH_LEGACY_HEADERS = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const esbuild = require("esbuild");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "../..");
const tokens = require("../../lib/tokens");

// ── Backend: real socket server + profile fakes ─────────────────────────────

const Buyer = require("../../models/Buyer");
const buyers = [{ buyer_id: "buyer_A", name: "Buyer A", email: "a@x.test", password_hash: "h", auth: { token_version: 0 } }];
Buyer.findOne = (f) => ({ select() { return this; }, lean: async () => structuredClone(buyers.find((b) => b.buyer_id === f.buyer_id) || null) });
mongoose.connection.collection = () => ({ findOne: async () => null });
const socketLib = require("../../lib/socket");
const httpServer = http.createServer((q, r) => { r.writeHead(404); r.end(); });

// ── Frontend modules under test ─────────────────────────────────────────────

const OUT = path.join(ROOT, "node_modules", ".cache", "ss-auth-tests", `phase2g-${process.pid}.cjs`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: `export * as http from "./src/api/http.js"; export * as sc from "./src/api/socketClient.js";`,
    resolveDir: ROOT, loader: "js",
  },
  bundle: true, platform: "node", format: "cjs",
  external: ["socket.io-client", "axios"],
  outfile: OUT, logLevel: "error",
});
const F = require(OUT);

let url;
test.before(async () => {
  socketLib.initSocket(httpServer);
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});
test.after(async () => {
  socketLib.getIO().close();
  await new Promise((r) => httpServer.close(r));
  try { fs.unlinkSync(OUT); } catch { /* ignore */ }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const valid = (extra = {}) => tokens.signAccessToken({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "s", ...extra });
const expired = () => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "s", iat: now - 100, exp: now - 5 },
    process.env.JWT_ACCESS_SECRET, { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE });
};
const shortLived = (secs) => jwt.sign({ sub: "buyer_A", kind: "buyer", tv: 0, sid: "s" },
  process.env.JWT_ACCESS_SECRET, { algorithm: "HS256", issuer: tokens.ISSUER, audience: tokens.AUDIENCE, expiresIn: secs });

let refreshCalls = 0;
let refreshResponder = () => ({ status: 401, body: { success: false } });
globalThis.fetch = async (input) => {
  if (String(input) === "/api/auth/refresh") {
    refreshCalls += 1;
    const { status, body } = refreshResponder();
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }
  return new Response("{}", { status: 404 });
};

const handles = [];
function open(opts = {}) {
  const h = F.sc.createAuthenticatedSocket(url, { ioOptions: { transports: ["websocket"], reconnectionDelay: 50, ...opts } });
  handles.push(h);
  return h;
}
const waitFor = (pred, ms = 4000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => (pred() ? resolve() : Date.now() - t0 > ms ? reject(new Error("timeout")) : setTimeout(tick, 20));
  tick();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(() => {
  refreshCalls = 0;
  refreshResponder = () => ({ status: 401, body: { success: false } });
  F.http.clearAccessToken();
  buyers[0].auth.token_version = 0;
});
test.afterEach(() => { while (handles.length) handles.pop().dispose(); });

// ── Tests ───────────────────────────────────────────────────────────────────

test("connects with the in-memory JWT via auth; no role/id is sent", async () => {
  F.http.setAccessToken(valid());
  const { socket } = open();
  await waitFor(() => socket.connected);
  const [server] = await socketLib.getIO().fetchSockets();
  assert.equal(server.handshake.auth.token, F.http.getAccessToken());
  assert.equal(server.handshake.query.role, undefined);
  assert.equal(server.handshake.query.id, undefined);
  assert.deepEqual(socketLib.getStatus().by_role, { buyer: 1, seller: 0, admin: 0 });
  assert.equal(refreshCalls, 0);
});

test("expired access token → one refresh via the cookie flow → reconnects with the new token", async () => {
  F.http.setAccessToken(expired());
  const fresh = valid();
  refreshResponder = () => ({ status: 200, body: { access_token: fresh } });
  const { socket } = open();
  await waitFor(() => socket.connected);
  assert.equal(refreshCalls, 1);
  assert.equal(F.http.getAccessToken(), fresh);
});

test("server drops the socket at token expiry → refresh → reconnected (no re-login)", async () => {
  F.http.setAccessToken(shortLived(2));
  refreshResponder = () => ({ status: 200, body: { access_token: valid() } });
  const { socket } = open();
  await waitFor(() => socket.connected);
  let disconnects = 0;
  socket.on("disconnect", () => { disconnects += 1; });
  await waitFor(() => disconnects === 1, 5000);
  await waitFor(() => socket.connected, 3000);
  assert.equal(refreshCalls, 1);
});

test("missing token + refresh fails → session-expired once, no reconnect loop", async () => {
  const events = [];
  const off = F.http.onAuthEvent((e) => events.push(e.type));
  const { socket } = open();
  await sleep(600);
  off();
  assert.equal(socket.connected, false);
  assert.equal(refreshCalls, 1, "exactly one refresh attempt");
  assert.deepEqual(events, ["session-expired"]);
});

test("revoked session (stale token_version) → bounded retries, then session-expired; no stale-token loop", async () => {
  buyers[0].auth.token_version = 5;               // every token below is stale
  F.http.setAccessToken(valid());
  refreshResponder = () => ({ status: 200, body: { access_token: valid() } });
  const events = [];
  const off = F.http.onAuthEvent((e) => events.push(e.type));
  const { socket } = open();
  await sleep(1200);
  off();
  assert.equal(socket.connected, false);
  assert.ok(refreshCalls <= 2, `bounded refreshes (got ${refreshCalls})`);
  assert.deepEqual(events, ["session-expired"]);
  assert.equal(F.http.getAccessToken(), null, "token cleared");
});

test("reportSessionExpired clears the token and emits the existing session-expired event", () => {
  F.http.setAccessToken(valid());
  const events = [];
  const off = F.http.onAuthEvent((e) => events.push(e));
  F.http.reportSessionExpired("socket");
  off();
  assert.equal(F.http.getAccessToken(), null);
  assert.deepEqual(events.map((e) => [e.type, e.url]), [["session-expired", "socket"]]);
});
