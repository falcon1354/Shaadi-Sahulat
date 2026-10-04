/**
 * Phase 2I — legacy auth removal + remaining security hardening.
 * Run: npm run test:auth
 *
 * Loads the REAL server.js app (CORS, /uploads split, /api/files, every router)
 * without connecting to MongoDB: models are in-memory fakes, Flask is a local stub,
 * third-party services are unset. Temporary upload files are created under a unique
 * folder name and removed afterwards. No database, no network, no real email.
 */

// ── Environment (set BEFORE server.js loads dotenv, which never overrides) ───
Object.assign(process.env, {
  JWT_ACCESS_SECRET: "test-access-secret-0123456789-abcdefghijklmnop",
  INTERNAL_API_SECRET: "test-internal-secret-value-xyz",
  FRONTEND_ORIGIN: "http://localhost:3000",
  JWT_ACCESS_TTL: "15m",
  REFRESH_TTL_DAYS: "7",
  REFRESH_ABSOLUTE_DAYS: "30",
  BCRYPT_ROUNDS: "10",
  EMAIL_TRANSPORT: "disabled",
  AUTH_LEGACY_HEADERS: "true", // must have NO effect any more (Phase 2I)
  MONGODB_URI: "mongodb://127.0.0.1:1/none",
  ML_SERVICE_URL: "http://127.0.0.1:1",
  CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "",
  GROQ_API_KEY: "", KLING_API_KEY: "", FAL_KEY: "", TRYON_PROVIDER: "local",
  TONE_VOICE_URL: "http://127.0.0.1:1", REVIEW_TTS_ENABLED: "false",
  BNPL_CRYPTO_KEY: "0".repeat(64),
  BANK_OFFICER_EMAIL: "", BANK_OFFICER_PASSWORD_HASH: "", // set per test
  PRIVATE_FILE_URL_TTL_SECONDS: "600",
});
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const tokens = require("../../lib/tokens");

const ROOT = path.resolve(__dirname, "../..");

// ── Generic in-memory model fake (same approach as phase2f) ─────────────────

const stores = {};
let seq = 1;
const clone = (x) => (x === null || x === undefined ? x : structuredClone(x));
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ?? (c[k] = {}); c[ks.at(-1)] = v; }
function applyUpdate(doc, u) {
  const plain = !Object.keys(u).some((k) => k.startsWith("$"));
  for (const [p, v] of Object.entries(plain ? u : u.$set || {})) setPath(doc, p, v);
  for (const [p, v] of Object.entries(u.$inc || {})) setPath(doc, p, (getPath(doc, p) || 0) + v);
  for (const p of Object.keys(u.$unset || {})) setPath(doc, p, undefined);
  for (const [p, v] of Object.entries(u.$push || {})) { const a = getPath(doc, p) || []; a.push(v); setPath(doc, p, a); }
}
function condMatch(val, cond) {
  if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date) &&
      Object.keys(cond).some((k) => k.startsWith("$"))) {
    return Object.entries(cond).every(([op, arg]) => {
      if (op === "$in") return arg.map(String).includes(String(val));
      if (op === "$nin") return !arg.map(String).includes(String(val));
      if (op === "$ne") return String(val) !== String(arg);
      if (op === "$exists") return (val !== undefined) === Boolean(arg);
      if (op === "$gt") return val !== undefined && Number(val) > Number(arg);
      if (op === "$gte") return val !== undefined && (typeof arg === "number" ? Number(val) >= arg : new Date(val) >= new Date(arg));
      if (op === "$lte") return val !== undefined && (typeof arg === "number" ? Number(val) <= arg : new Date(val) <= new Date(arg));
      return true;
    });
  }
  if (cond === null) return val === null || val === undefined;
  if (Array.isArray(val)) return val.map(String).includes(String(cond));
  return String(val) === String(cond);
}
function match(doc, f = {}) {
  return Object.entries(f).every(([k, cond]) => {
    if (k === "$or") return cond.some((c) => match(doc, c));
    if (k === "$and") return cond.every((c) => match(doc, c));
    return condMatch(getPath(doc, k), cond);
  });
}
function docOf(row) {
  if (!row) return null;
  const d = clone(row);
  Object.defineProperty(d, "save", { value: async function () { Object.assign(row, { ...this }); return this; } });
  Object.defineProperty(d, "toObject", { value: () => clone(row) });
  Object.defineProperty(d, "markModified", { value: () => {} });
  return d;
}
function query(getter, single) {
  const ops = [];
  const api = {
    sort() { return api; }, populate() { return api; }, select() { return api; },
    skip(n) { ops.push((r) => r.slice(n)); return api; },
    limit(n) { ops.push((r) => r.slice(0, n)); return api; },
    lean: async () => { let r = getter(); if (!single) for (const op of ops) r = op(r); return clone(r); },
    exec() { return api.lean(); },
    then(res, rej) { return (single ? Promise.resolve(docOf(getter())) : api.lean()).then(res, rej); },
  };
  return api;
}
function fake(Model, name) {
  stores[name] = stores[name] || [];
  const rows = () => stores[name];
  Model.find = (f = {}) => query(() => rows().filter((d) => match(d, f)), false);
  Model.findOne = (f = {}) => query(() => rows().find((d) => match(d, f)) || null, true);
  Model.findById = (id) => query(() => rows().find((d) => String(d._id) === String(id)) || null, true);
  Model.countDocuments = async (f = {}) => rows().filter((d) => match(d, f)).length;
  Model.exists = async (f = {}) => { const d = rows().find((x) => match(x, f)); return d ? { _id: d._id } : null; };
  Model.create = async (data) => {
    const out = [].concat(data).map((d) => { const row = { _id: `id${seq++}`, created_at: new Date(), ...clone(d) }; rows().push(row); return docOf(row); });
    return Array.isArray(data) ? out : out[0];
  };
  Model.updateOne = async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
  Model.updateMany = async (f, u) => { const ds = rows().filter((x) => match(x, f)); ds.forEach((d) => applyUpdate(d, u)); return { modifiedCount: ds.length }; };
  Model.findOneAndUpdate = (f, u) => query(() => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return d || null; }, true);
  Model.deleteOne = async (f) => { const i = rows().findIndex((x) => match(x, f)); if (i >= 0) rows().splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; };
  Model.prototype.save = async function () { const o = this.toObject(); o._id = String(o._id); rows().push(o); return this; };
}

const MODELS = ["Buyer", "Admin", "Order", "Package", "Dispute", "DisputeMessage", "Review", "Notification",
  "DowryEstimation", "VisualRecommendation", "Banner", "BnplApplication", "BnplBank", "BnplOfferLetter",
  "BnplDocumentBundle", "BnplDocument", "BnplUser", "SellerPayout", "AdminWallet", "AdminCategory", "AuthSession"];
for (const n of MODELS) fake(require(`../../models/${n}`), n);

const realCollection = mongoose.connection.collection.bind(mongoose.connection);
mongoose.connection.collection = (name) => {
  if (name !== "sellers") return realCollection(name); // model compilation
  stores["col:sellers"] = stores["col:sellers"] || [];
  const rows = () => stores["col:sellers"];
  return {
    findOne: async (f, o) => { const d = clone(rows().find((x) => match(x, f))); if (d && o?.projection) for (const [k, v] of Object.entries(o.projection)) if (v === 0) delete d[k]; return d || null; },
    updateOne: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); },
    findOneAndUpdate: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return clone(d); },
  };
};
mongoose.connection.db = {
  collection: (name) => {
    stores[`native:${name}`] = stores[`native:${name}`] || [];
    const rows = () => stores[`native:${name}`];
    return {
      findOne: async (f) => clone(rows().find((x) => match(x, f)) || null),
      findOneAndUpdate: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return clone(d || null); },
      updateOne: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; },
    };
  },
};

// ── Temporary upload files (unique folder, removed in test.after) ───────────

const TAG = `__phase2i_${process.pid}`;
const UP = path.join(ROOT, "Uploads");
const REL = {
  cnic: `BNPL/${TAG}/BNPL-A/cnic_front.png`,
  evidence: `Dispute/${TAG}/evidence.png`,
  banner: `Banners/${TAG}.png`,
};
const BYTES = { cnic: Buffer.from("CNIC-FRONT-BYTES"), evidence: Buffer.from("EVIDENCE-BYTES"), banner: Buffer.from("PUBLIC-BANNER") };
function writeUploads() {
  for (const k of Object.keys(REL)) {
    const abs = path.join(UP, ...REL[k].split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, BYTES[k]);
  }
}
function removeUploads() {
  for (const p of [path.join(UP, "BNPL", TAG), path.join(UP, "Dispute", TAG), path.join(UP, "Banners", `${TAG}.png`)]) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

// ── Seed data ───────────────────────────────────────────────────────────────

const PW = "Test-Passw0rd!"; // dummy test password
const BC = bcrypt.hashSync(PW, 10);
const OFFICER_PW = "Officer-Test-Passw0rd"; // dummy test password
const OFFICER_HASH = bcrypt.hashSync(OFFICER_PW, 10);

function seed() {
  for (const k of Object.keys(stores)) stores[k].length = 0;
  stores.Buyer.push(
    { _id: "b1", buyer_id: "buyer_A", name: "Buyer A", email: "a@x.test", password_hash: BC, phone: "03001234567", saved_addresses: [] },
    { _id: "b2", buyer_id: "buyer_B", name: "Buyer B", email: "b@x.test", password_hash: BC, phone: "03001234568", saved_addresses: [] },
  );
  stores.Admin.push({ _id: "a1", admin_id: "admin_1", name: "Admin", email: "adm@x.test", password_hash: BC });
  stores["col:sellers"] = [
    { seller_id: "sel_A", name: "Seller A", email: "sa@x.test", password_hash: BC },
    { seller_id: "sel_B", name: "Seller B", email: "sb@x.test", password_hash: BC },
    { seller_id: "sel_OFF", name: "Disabled Seller", email: "off@x.test", password_hash: BC, auth: { login_disabled: true } },
  ];
  const p = (id, extra) => ({ product_id: id, seller_id: "sel_A", title: `T-${id}`, price: 50000, discount_price: 45000,
    stock_quantity: 100, availability_status: "available", primary_image_url: `/images/${id}.jpg`, major_category: "bridal", ...extra });
  stores["native:seller_products"] = [
    p("P-A"),
    p("P-B", { seller_id: "sel_B", price: 1000, discount_price: 0 }),
    p("P-HIDDEN", { availability_status: "hidden" }),
    p("P-FROZEN", { availability_status: "frozen" }),
    p("P-SOLD", { availability_status: "sold", is_available: false, stock_quantity: 0 }),
    p("P-PENDING", { admin_approval_status: "pending" }),
    p("P-REJECTED", { admin_approval_status: "rejected" }),
    p("P-OFF", { seller_id: "sel_OFF" }),
    p("P-GHOST", { seller_id: "sel_DELETED" }),
  ];
  stores["native:products"] = [];
  stores.Order.push({ _id: "o1", order_id: "ORD-A", buyer_id: "buyer_A", status: "CONFIRMED", items: [], total_amount: 100 });
  stores.Package.push({ _id: "p1", package_id: "PKG-A", order_id: "ORD-A", seller_id: "sel_A", status: "CONFIRMED" });
  stores.Dispute.push({
    _id: "d1", dispute_id: "DSP-A", order_id: "ORD-A", buyer_id: "buyer_A", seller_id: "sel_A", status: "SELLER_RESPONSE_PENDING",
    muted_roles: [], seller_response_deadline: new Date(Date.now() + 86400000),
    evidence: [
      { file_path: REL.evidence, original_name: "photo.png", uploaded_by: "buyer" },
      { file_path: "https://res.cloudinary.com/demo/image/upload/v1/shaadisahulat/Dispute/DSP-A/x_abc.png", original_name: "cloud.png", uploaded_by: "buyer" },
    ],
  });
  stores.BnplBank.push({ _id: "bk", bank_id: "HBL", code: "HBL", name: "HBL", active: true });
  stores.BnplApplication.push(
    { _id: "ba1", application_no: "BNPL-A", buyer_id: "buyer_A", order_id: "ORD-A", bank_id: "HBL", status: "PENDING_BANK_VERIFICATION", amount: 100 },
    { _id: "ba2", application_no: "BNPL-B", buyer_id: "buyer_B", order_id: "ORD-B", bank_id: "HBL", status: "PENDING_BANK_VERIFICATION", amount: 100 },
  );
  stores.BnplDocument.push(
    { _id: "doc1", application_id: "BNPL-A", buyer_id: "buyer_A", doc_type: "cnic_front", file_path: REL.cnic, original_name: "cnic.png", mime_type: "image/png" },
  );
  flaskCalls = [];
}

// ── Flask stub (records the internal secret it receives) ────────────────────

let flaskCalls = [];
const flask = http.createServer((req, res) => {
  flaskCalls.push({ method: req.method, url: req.url, secret: req.headers["x-internal-secret"] });
  res.writeHead(200, { "Content-Type": "application/json" });
  if (req.url.startsWith("/seller/profile/")) return res.end(JSON.stringify({ success: true, seller: { seller_id: "sel_A", name: "Seller A" } }));
  return res.end(JSON.stringify({ success: true }));
});

// ── Boot the real app ───────────────────────────────────────────────────────

let base;
let server;
let serverModule;
test.before(async () => {
  await new Promise((r) => flask.listen(0, "127.0.0.1", r));
  process.env.VISUAL_ML_URL = `http://127.0.0.1:${flask.address().port}`;
  writeUploads();
  serverModule = require("../../server"); // does NOT connect (require.main !== module)
  server = serverModule.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server?.close(); flask.close(); removeUploads(); });
test.beforeEach(() => {
  seed();
  process.env.BANK_OFFICER_EMAIL = "";
  process.env.BANK_OFFICER_PASSWORD_HASH = "";
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const tok = (kind, sub) => tokens.signAccessToken({ sub, kind, tv: 0, sid: "sid-test" });
const T = { buyerA: () => tok("buyer", "buyer_A"), buyerB: () => tok("buyer", "buyer_B"),
  sellerA: () => tok("seller", "sel_A"), sellerB: () => tok("seller", "sel_B"), admin: () => tok("admin", "admin_1") };
const CSRF = { "X-Requested-With": "ShaadiSahulat", Origin: "http://localhost:3000" };
async function call(method, p, { token, headers = {}, body } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(`${base}${p}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary / text */ }
  return { status: res.status, body: json, text, headers: res.headers };
}
/** Raw request (no URL normalisation) for traversal probes. */
function rawGet(p) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "GET" }, (res) => {
      let data = ""; res.on("data", (c) => (data += c)); res.on("end", () => resolve({ status: res.statusCode, text: data }));
    });
    req.on("error", () => resolve({ status: 0, text: "" }));
    req.end();
  });
}
const readSrc = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ORDER = (extra = {}) => ({
  items: [{ product_id: "P-A", qty: 2 }],
  shipping_address: { line1: "House 1", city: "Lahore", phone: "03001234567" },
  payment_method: "COD",
  delivery_method: "standard",
  ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
// LEGACY AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

test("LEGACY: old buyer/seller/admin login + register endpoints answer 410 and authenticate nothing", async () => {
  const buyersBefore = stores.Buyer.length;
  const sellersBefore = stores["col:sellers"].length;
  for (const p of ["/api/buyer/login", "/api/buyer/register", "/api/seller/login", "/api/seller/register", "/api/admin/login"]) {
    for (const body of [{ email: "a@x.test", password: PW }, { name: "N", email: "new@x.test", password: PW }]) {
      const r = await call("POST", p, { body });
      assert.equal(r.status, 410, p);
      assert.equal(r.body.code, "ENDPOINT_REMOVED");
      assert.ok(!r.text.includes("password_hash") && !("buyer" in r.body) && !("seller" in r.body) && !("admin" in r.body) && !r.body.access_token, p);
      assert.match(r.body.error, /\/api\/auth\//);
    }
    assert.equal((await call("GET", p)).status, 410, `GET ${p}`);
  }
  assert.equal(stores.Buyer.length, buyersBefore, "nothing registered");
  assert.equal(stores["col:sellers"].length, sellersBefore);
  assert.equal(stores.AuthSession.length, 0, "no session issued");
  assert.equal(flaskCalls.length, 0, "old seller endpoints no longer call Flask");
});

test("LEGACY: the canonical /api/auth/login still works for buyer, seller and admin", async () => {
  for (const [portal, email] of [["buyer", "a@x.test"], ["seller", "sa@x.test"], ["admin", "adm@x.test"]]) {
    const r = await call("POST", "/api/auth/login", { headers: CSRF, body: { portal, email, password: PW } });
    assert.equal(r.status, 200, portal);
    assert.equal(tokens.verifyAccessToken(r.body.access_token).kind, portal);
  }
});

test("LEGACY: the removed controller functions no longer exist", () => {
  assert.equal(require("../../controllers/buyerController").loginBuyer, undefined);
  assert.equal(require("../../controllers/buyerController").registerBuyer, undefined);
  assert.equal(require("../../controllers/sellerController").loginSeller, undefined);
  assert.equal(require("../../controllers/sellerController").registerSeller, undefined);
  assert.equal(require("../../controllers/adminController").loginAdmin, undefined);
  assert.equal(require("../../services/sellerClient").loginSeller, undefined);
  assert.equal(require("../../services/sellerClient").registerSeller, undefined);
});

// ════════════════════════════════════════════════════════════════════════════
// LEGACY IDENTITY HEADERS
// ════════════════════════════════════════════════════════════════════════════

const FORGED_ADMIN = { "x-user-id": "admin_1", "x-user-role": "admin" };
const FORGED_BUYER = { "x-user-id": "buyer_A", "x-user-role": "buyer" };

test("HEADERS: forged x-user-id / x-user-role never authenticate (AUTH_LEGACY_HEADERS=true is ignored)", async () => {
  assert.equal(process.env.AUTH_LEGACY_HEADERS, "true");
  const probes = [
    ["GET", "/api/admin/buyers", FORGED_ADMIN], ["GET", "/api/admin/disputes", FORGED_ADMIN],
    ["GET", "/api/orders", FORGED_BUYER], ["GET", "/api/buyer/buyer_A/full-data", FORGED_BUYER],
    ["GET", "/api/notifications", FORGED_BUYER], ["GET", "/api/disputes/DSP-A", FORGED_BUYER],
    ["GET", "/api/bnpl/applications/BNPL-A", FORGED_BUYER], ["GET", "/api/auth/me", FORGED_ADMIN],
    ["POST", "/api/orders", FORGED_BUYER], ["GET", "/api/socket/status", FORGED_ADMIN],
  ];
  for (const [m, p, h] of probes) {
    const r = await call(m, p, { headers: h, body: m === "POST" ? ORDER() : undefined });
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test("HEADERS: forged headers cannot change a real JWT identity", async () => {
  const r = await call("GET", "/api/admin/buyers", { token: T.buyerA(), headers: FORGED_ADMIN });
  assert.equal(r.status, 403);
  const me = await call("GET", "/api/auth/me", { token: T.buyerA(), headers: FORGED_ADMIN });
  assert.deepEqual([me.body.user.role, me.body.user.id], ["buyer", "buyer_A"]);
});

test("HEADERS: no hidden fallback remains in backend code or config", () => {
  for (const f of ["lib/auth.js", "lib/tokens.js", "lib/authorize.js", "server.js", "lib/socket.js"]) {
    const src = stripComments(readSrc(f));
    assert.ok(!/x-user-(id|role)/i.test(src), `${f} reads x-user headers`);
    assert.ok(!/AUTH_LEGACY_HEADERS|legacyHeaders\s*:\s*process/.test(src), `${f} has a legacy switch`);
  }
  assert.equal(tokens.getAuthConfig().legacyHeaders, undefined);
  const dirs = ["routes", "controllers", "services", "lib"];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).filter((x) => x.endsWith(".js"))) {
      const src = stripComments(readSrc(`${d}/${f}`));
      assert.ok(!/(req\.header\(|req\.headers\[)\s*["']x-user-(id|role)/i.test(src), `${d}/${f}`);
    }
  }
  assert.ok(!/AUTH_LEGACY_HEADERS/.test(readSrc(".env.example")), ".env.example no longer offers the switch");
});

// ════════════════════════════════════════════════════════════════════════════
// CORS
// ════════════════════════════════════════════════════════════════════════════

test("CORS: only the configured frontend origin is allowed (no wildcard)", async () => {
  const ok = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:3000" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const evil = await fetch(`${base}/api/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const pre = await fetch(`${base}/api/orders`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
  assert.notEqual(pre.headers.get("access-control-allow-origin"), "*");
  assert.notEqual(pre.headers.get("access-control-allow-origin"), "https://evil.example");
});

// ════════════════════════════════════════════════════════════════════════════
// UPLOADS
// ════════════════════════════════════════════════════════════════════════════

test("UPLOADS: private folders are not served by /uploads (any case, traversal, encoding)", async () => {
  const probes = [
    `/uploads/${REL.cnic}`, `/uploads/${REL.cnic.replace("BNPL", "bnpl")}`, `/uploads/${REL.evidence}`,
    `/uploads/Banners/../${REL.cnic}`, `/uploads/Banners/%2e%2e/${REL.cnic}`, `/uploads/Banners/..%2f${REL.cnic}`,
    `/uploads/Banners/..%5c${REL.cnic.replace(/\//g, "%5c")}`, `/uploads//${REL.cnic}`, `/uploads/./${REL.cnic}`,
  ];
  for (const p of probes) {
    const r = await rawGet(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.text.includes("CNIC-FRONT-BYTES") && !r.text.includes("EVIDENCE-BYTES"), p);
  }
});

test("UPLOADS: public images still work", async () => {
  const r = await rawGet(`/uploads/${REL.banner}`);
  assert.equal(r.status, 200);
  assert.equal(r.text, "PUBLIC-BANNER");
});

test("UPLOADS: the owning buyer gets a working signed CNIC link; another buyer / anonymous / seller do not", async () => {
  const own = await call("GET", "/api/bnpl/applications/BNPL-A", { token: T.buyerA() });
  assert.equal(own.status, 200);
  const doc = own.body.application.documents[0];
  assert.match(doc.url, /^\/api\/files\/private\?ref=[\w-]+&exp=\d+&sig=[\w-]+$/);
  assert.ok(!own.text.includes(REL.cnic) && !own.text.includes("file_path"), "storage path never exposed");
  const file = await call("GET", doc.url);
  assert.equal(file.status, 200);
  assert.equal(file.text, "CNIC-FRONT-BYTES");
  assert.match(file.headers.get("cache-control"), /no-store/);
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");

  assert.equal((await call("GET", "/api/bnpl/applications/BNPL-A", { token: T.buyerB() })).status, 404, "other buyer");
  assert.equal((await call("GET", "/api/bnpl/applications/BNPL-A")).status, 401, "anonymous");
  assert.equal((await call("GET", "/api/bnpl/applications/BNPL-A", { token: T.sellerA() })).status, 403, "seller");
});

test("UPLOADS: signed links cannot be forged, tampered with, reused after expiry, or pointed elsewhere", async () => {
  const pf = require("../../lib/privateFiles");
  const good = pf.signPrivateFileUrl(REL.cnic);
  const u = new URL(good, "http://x");
  const q = (over) => `/api/files/private?${new URLSearchParams({ ...Object.fromEntries(u.searchParams), ...over })}`;
  assert.equal((await call("GET", "/api/files/private")).status, 404, "unsigned");
  assert.equal((await call("GET", q({ sig: "A".repeat(43) }))).status, 404, "bad signature");
  assert.equal((await call("GET", q({ ref: Buffer.from(REL.evidence).toString("base64url") }))).status, 404, "ref swapped");
  assert.equal((await call("GET", q({ exp: String(Number(u.searchParams.get("exp")) + 3600) }))).status, 404, "expiry extended");
  const expired = pf.signPrivateFileUrl(REL.cnic, { now: Date.now() - 3600 * 1000 });
  assert.equal((await call("GET", expired)).status, 410, "expired");
  // only private upload folders / Cloudinary can ever be signed
  for (const ref of ["../.env", "/etc/passwd", "Banners/x.png", "BNPL/../../.env", "C:\\Windows\\win.ini", "http://evil.test/x.png", "https://res.cloudinary.com.evil.test/x"]) {
    assert.equal(pf.signPrivateFileUrl(ref), "", ref);
  }
  assert.equal((await call("GET", good)).status, 200, "the genuine link works");
});

test("UPLOADS: dispute evidence — participants get signed links (no raw paths/URLs); others are denied", async () => {
  for (const t of [T.buyerA(), T.sellerA(), T.admin()]) {
    const r = await call("GET", "/api/disputes/DSP-A", { token: t });
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes("file_path") && !r.text.includes("res.cloudinary.com") && !r.text.includes(REL.evidence));
    const [local, cloud] = r.body.dispute.evidence;
    assert.match(local.url, /^\/api\/files\/private\?/);
    assert.match(cloud.url, /^\/api\/files\/private\?/);
    const file = await call("GET", local.url);
    assert.equal(file.text, "EVIDENCE-BYTES");
  }
  assert.equal((await call("GET", "/api/disputes/DSP-A", { token: T.buyerB() })).status, 403);
  assert.equal((await call("GET", "/api/disputes/DSP-A", { token: T.sellerB() })).status, 403);
  const list = await call("GET", "/api/disputes", { token: T.buyerA() });
  assert.ok(!list.text.includes("file_path") && !list.text.includes("res.cloudinary.com"));
  const admin = await call("GET", "/api/admin/disputes", { token: T.admin() });
  assert.equal(admin.status, 200);
  assert.ok(!admin.text.includes("file_path") && !admin.text.includes("res.cloudinary.com"));
  const order = await call("GET", "/api/orders/ORD-A", { token: T.buyerA() });
  assert.ok(!order.text.includes("file_path") && !order.text.includes("res.cloudinary.com"));
});

test("UPLOADS: bank officer document endpoint streams the file (no redirect to the storage URL)", async () => {
  process.env.BANK_OFFICER_EMAIL = "officer@bank.test";
  process.env.BANK_OFFICER_PASSWORD_HASH = OFFICER_HASH;
  const login = await call("POST", "/api/bank/login", { body: { email: "officer@bank.test", password: OFFICER_PW } });
  const r = await fetch(`${base}/api/bank/applications/BNPL-A/document/doc1`, { headers: { "x-officer-token": login.body.token }, redirect: "manual" });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "CNIC-FRONT-BYTES");
  assert.equal((await fetch(`${base}/api/bank/applications/BNPL-A/document/doc1`)).status, 401, "no officer token");
  assert.equal((await fetch(`${base}/api/bank/applications/BNPL-A/document/doc1`, { headers: { Authorization: `Bearer ${T.buyerA()}` } })).status, 401, "buyer JWT is not an officer token");
});

test("UPLOADS: new private uploads get unguessable Cloudinary public_ids", () => {
  const src = readSrc("lib/storage.js");
  assert.match(src, /publicId: `\$\{base\}_\$\{_privateSuffix\(\)\}`/, "BNPL");
  assert.match(src, /publicId: `\$\{path\.parse\(safeName\)\.name\}_\$\{_privateSuffix\(\)\}`/, "Dispute");
  assert.match(src, /_privateSuffix = \(\) => crypto\.randomBytes\(16\)/);
});

// ════════════════════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════════════════════

const lastOrder = () => stores.Order.at(-1);

test("ORDERS: client shipping_cost is ignored — shipping comes from the server table", async () => {
  for (const [method, sent, expected] of [["standard", 0, 150], ["standard", 999999, 150], ["express", 1, 350], [undefined, -50, 150]]) {
    const r = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ delivery_method: method, shipping_cost: sent }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const o = lastOrder();
    assert.equal(o.shipping_total, expected);
    assert.equal(o.delivery_method, method || "standard");
    assert.equal(o.total_amount, 90000 + expected, "subtotal (DB price) + server shipping");
  }
  const bad = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ delivery_method: "free" }) });
  assert.equal(bad.status, 400);
  const bad2 = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ delivery_method: { $ne: "x" } }) });
  assert.equal(bad2.status, 400);
});

test("ORDERS: client price / discount / seller_id / title / image tampering is ignored", async () => {
  const r = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({
    items: [{ product_id: "P-A", qty: 2, price: 1, discount_price: 1, subtotal: 2, seller_id: "sel_B", title: "fake", image_url: "https://evil.test/pixel.gif", major_category: "x" }],
  }) });
  assert.equal(r.status, 201);
  const it = lastOrder().items[0];
  assert.deepEqual([it.seller_id, it.price, it.subtotal, it.title, it.image_url, it.major_category],
    ["sel_A", 45000, 90000, "T-P-A", "/images/P-A.jpg", "bridal"]);
  assert.ok(stores.Package.some((p) => p.order_id === lastOrder().order_id && p.seller_id === "sel_A"));
  assert.ok(!stores.Package.some((p) => p.order_id === lastOrder().order_id && p.seller_id === "sel_B"));
});

test("ORDERS: hidden, frozen, sold, unapproved, disabled-seller and missing-seller products cannot be ordered", async () => {
  for (const id of ["P-HIDDEN", "P-FROZEN", "P-SOLD", "P-PENDING", "P-REJECTED", "P-OFF", "P-GHOST", "NOPE"]) {
    const before = stores.Order.length;
    const r = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ items: [{ product_id: "P-A", qty: 1 }, { product_id: id, qty: 1 }] }) });
    assert.equal(r.status, 400, id);
    assert.equal(stores.Order.length, before, `${id}: no order written`);
  }
  assert.equal(stores["native:seller_products"].find((p) => p.product_id === "P-A").stock_quantity, 100, "stock untouched by rejected orders");
});

test("ORDERS: a BNPL application can only be linked by its owner", async () => {
  const other = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ payment_method: "BNPL", bnpl_application_id: "BNPL-B" }) });
  assert.equal(other.status, 400);
  const own = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ payment_method: "BNPL", bnpl_application_id: "BNPL-A" }) });
  assert.equal(own.status, 201);
  const codWithApp = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ bnpl_application_id: "BNPL-A" }) });
  assert.equal(codWithApp.status, 400);
  const injected = await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER({ payment_method: "BNPL", bnpl_application_id: { $ne: "" } }) });
  assert.equal(injected.status, 400);
});

test("ORDERS: seller_view_token is CSPRNG (24 hex, unique); identity comes from the JWT", async () => {
  await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER() });
  await call("POST", "/api/orders", { token: T.buyerA(), body: ORDER() });
  const [a, b] = stores.Order.slice(-2).map((o) => o.seller_view_token);
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, b);
  assert.equal(lastOrder().buyer_id, "buyer_A");
  assert.ok(!/Math\.random/.test(stripComments(readSrc("routes/orders.js")).split("seller_view_token")[1].slice(0, 200)));
});

test("ORDERS: server shipping table matches the checkout page prices", () => {
  const { DELIVERY_OPTIONS } = require("../../lib/shipping");
  const page = readSrc("src/components/Cart/CheckoutPage.jsx");
  for (const [id, { price }] of Object.entries(DELIVERY_OPTIONS)) {
    assert.match(page, new RegExp(`id: '${id}'[^}]*price: ${price}\\b`), id);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// BANK OFFICER
// ════════════════════════════════════════════════════════════════════════════

test("BANK: credentials come from the environment; login disabled (503) until configured", async () => {
  const r = await call("POST", "/api/bank/login", { body: { email: "officer@bank.test", password: OFFICER_PW } });
  assert.equal(r.status, 503);
  process.env.BANK_OFFICER_EMAIL = "Officer@Bank.test";
  process.env.BANK_OFFICER_PASSWORD_HASH = "not-a-bcrypt-hash";
  assert.equal((await call("POST", "/api/bank/login", { body: { email: "officer@bank.test", password: OFFICER_PW } })).status, 503, "invalid hash = not configured");
});

test("BANK: secure token generation, no password in responses, wrong credentials rejected", async () => {
  process.env.BANK_OFFICER_EMAIL = "officer@bank.test";
  process.env.BANK_OFFICER_PASSWORD_HASH = OFFICER_HASH;
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const r = await call("POST", "/api/bank/login", { body: { email: " OFFICER@bank.test ", password: OFFICER_PW } });
    assert.equal(r.status, 200);
    assert.match(r.body.token, /^[A-Za-z0-9_-]{43}$/, "256-bit base64url");
    assert.ok(!seen.has(r.body.token)); seen.add(r.body.token);
    assert.ok(!("default_password" in r.body) && !r.text.includes(OFFICER_PW) && !r.text.includes("$2"));
    assert.equal((await call("GET", "/api/bank/applications", { headers: { "x-officer-token": r.body.token } })).status, 200);
  }
  assert.equal((await call("POST", "/api/bank/login", { body: { email: "officer@bank.test", password: "wrong" } })).status, 401);
  assert.equal((await call("POST", "/api/bank/login", { body: { email: "x@bank.test", password: OFFICER_PW } })).status, 401);
  assert.equal((await call("POST", "/api/bank/login", { body: { email: ["officer@bank.test"], password: { $ne: "" } } })).status, 401);
  assert.equal((await call("GET", "/api/bank/applications", { headers: { "x-officer-token": "guess" } })).status, 401);
});

test("BANK: login is rate limited", async () => {
  process.env.BANK_OFFICER_EMAIL = "officer@bank.test";
  process.env.BANK_OFFICER_PASSWORD_HASH = OFFICER_HASH;
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call("POST", "/api/bank/login", { body: { email: "rl@bank.test", password: "x" } })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
  assert.equal(codes[10], 429);
});

test("BANK: no Math.random security token and no hardcoded bank credentials in source", () => {
  const auth = stripComments(readSrc("lib/auth.js"));
  const fn = auth.slice(auth.indexOf("function issueOfficerToken"), auth.indexOf("function requireBankOfficer"));
  assert.ok(!/Math\.random/.test(fn));
  assert.match(fn, /crypto\.randomBytes\(32\)/);
  for (const f of ["routes/bank.js", "server.js", "src/components/Bank/BankLoginPage.jsx", "ROUTES.md", "seeds/seedBnplBanks.js", "seeds/seedFullLifecycleV2.js"]) {
    const src = readSrc(f);
    assert.ok(!/bank123/.test(src), `${f} contains the demo password`);
  }
  assert.ok(!/officer@bank\.com/.test(stripComments(readSrc("routes/bank.js"))));
  const bankApi = stripComments(readSrc("src/api/bankApi.js"));
  assert.ok(!/localStorage\.(setItem|getItem)/.test(bankApi), "officer token no longer persisted in localStorage");
});

// ════════════════════════════════════════════════════════════════════════════
// AI / EXPENSIVE ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

test("AI: review AI + try-on require authentication", async () => {
  assert.equal((await call("POST", "/api/reviews/ai/suggest-rating", { body: { text: "nice" } })).status, 401);
  assert.equal((await call("POST", "/api/reviews/ai/generate-reviews", { body: { rating: 5 } })).status, 401);
  assert.equal((await call("POST", "/api/reviews/preview-voice", { body: { text: "nice" } })).status, 401);
  assert.equal((await call("POST", "/api/visual/tryon")).status, 401);
});

test("AI: generate-reviews is limited per account (15 / 10 min); another account is unaffected", async () => {
  const codes = [];
  for (let i = 0; i < 16; i++) codes.push((await call("POST", "/api/reviews/ai/generate-reviews", { token: T.buyerA(), body: { rating: 5, length: "short" } })).status);
  assert.ok(codes.slice(0, 15).every((c) => c !== 429), JSON.stringify(codes));
  assert.equal(codes[15], 429);
  assert.notEqual((await call("POST", "/api/reviews/ai/generate-reviews", { token: T.buyerB(), body: { rating: 5 } })).status, 429);
});

test("AI: try-on is limited per account (10 / hour)", async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call("POST", "/api/visual/tryon", { token: T.sellerA() })).status);
  assert.ok(codes.slice(0, 10).every((c) => c !== 429), JSON.stringify(codes));
  assert.equal(codes[10], 429);
  const body = (await call("POST", "/api/visual/tryon", { token: T.sellerA() })).body;
  assert.equal(body.code, "RATE_LIMITED");
});

test("AI: anonymous dowry estimate is limited per IP (30 / 10 min)", async () => {
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await call("POST", "/api/dowry/estimate", { body: {} })).status);
  assert.ok(codes.slice(0, 30).every((c) => c !== 429), JSON.stringify(codes));
  assert.equal(codes[30], 429);
});

test("AI: every expensive route is wired to a limiter", () => {
  const checks = {
    "routes/visual.js": [/"\/recommend",\s*optionalAuth,\s*limits\.visualRecommend,\s*upload/, /"\/tryon",\s*authenticate,\s*limits\.tryOn,/, /"\/tryon\/fit", limits\.tryOnFit,/],
    "routes/reviews.js": [/suggest-rating", authenticate, limits\.aiSuggestRating/, /generate-reviews", authenticate, limits\.aiGenerate/, /preview-voice", requireBuyer, limits\.reviewVoice/],
    "routes/dowry.js": [/"\/estimate",\s+limits\.dowryEstimate/, /"\/rule-only",\s+limits\.dowryEstimate/],
    "routes/bnpl.js": [/ocr-preview", requireBuyer, limits\.ocr, ocrPreviewUpload/, /"\/applications", requireBuyer, limits\.bnplSubmit, upload/],
  };
  for (const [f, res] of Object.entries(checks)) for (const re of res) assert.match(readSrc(f), re, `${f} ${re}`);
});

// ════════════════════════════════════════════════════════════════════════════
// NODE → FLASK
// ════════════════════════════════════════════════════════════════════════════

test("FLASK: the legitimate Node → Flask flow carries the internal secret; responses stay sanitized", async () => {
  const r = await call("GET", "/api/seller/profile/sel_A");
  assert.equal(r.status, 200);
  const hit = flaskCalls.find((c) => c.url.startsWith("/seller/profile/"));
  assert.ok(hit, "reached Flask");
  assert.equal(hit.secret, process.env.INTERNAL_API_SECRET);
  assert.ok(!r.text.includes("password_hash") && !r.text.includes(process.env.INTERNAL_API_SECRET));
});

test("FLASK: the secret never leaves for non-internal origins", async () => {
  const { isInternalRequest } = require("../../lib/flaskHttp");
  const axios = require("axios");
  const port = flask.address().port;
  const cases = [
    [`http://127.0.0.1:${port}/x`, true],
    [`http://127.0.0.1:${port + 1}/x`, false],
    [`http://127.0.0.1:${port}.evil.test/x`, false],
    ["https://api.groq.com/openai/v1/chat", false],
    ["https://res.cloudinary.com/demo/x", false],
    [`http://evil.test/?u=http://127.0.0.1:${port}`, false],
  ];
  for (const [url, expected] of cases) assert.equal(isInternalRequest(axios, { url }), expected, url);
});

// ════════════════════════════════════════════════════════════════════════════
// SOCKET (Phase 2G regression guard)
// ════════════════════════════════════════════════════════════════════════════

test("SOCKET: no query identity, no wildcard origin, JWT-only handshake", () => {
  const src = stripComments(readSrc("lib/socket.js"));
  assert.ok(!/handshake\.query\.(role|id|user)/.test(src), "no query identity");
  assert.ok(!/origin:\s*["']\*["']|origin:\s*true/.test(src), "no wildcard origin");
  assert.match(src, /handshake\.auth/);
  assert.match(src, /verifyAndResolveToken/);
  const client = stripComments(readSrc("src/api/socketClient.js"));
  assert.ok(!/query:\s*\{/.test(client), "client sends no query identity");
});
