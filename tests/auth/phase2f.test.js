/**
 * Phase 2F — backend authorization & ownership security tests.
 * Run: npm run test:auth
 *
 * Exercises the REAL route files + auth middleware with in-memory model fakes and a
 * local Flask stub (seller products). No database or network access.
 */

process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET = "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.JWT_ACCESS_TTL = "15m";
process.env.REFRESH_TTL_DAYS = "7";
process.env.REFRESH_ABSOLUTE_DAYS = "30";
process.env.BCRYPT_ROUNDS = "10";
process.env.EMAIL_TRANSPORT = "disabled"; // tests never send/write email
process.env.AUTH_LEGACY_HEADERS = "false";
delete process.env.NODE_ENV;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const tokens = require("../../lib/tokens");

// ── Generic in-memory model fake ────────────────────────────────────────────

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
      if (op === "$lte") return val !== undefined && new Date(val) <= new Date(arg);
      if (op === "$gte") return val !== undefined && new Date(val) >= new Date(arg);
      if (op === "$regex") return new RegExp(arg, cond.$options || "").test(String(val ?? ""));
      if (op === "$options") return true;
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
  const excluded = [];
  const project = (r) => { if (!excluded.length || !r) return r; const strip = (d) => { for (const f of excluded) delete d[f]; return d; }; return Array.isArray(r) ? r.map(strip) : strip(r); };
  const api = {
    sort() { return api; }, populate() { return api; },
    select(spec) { if (typeof spec === "string") for (const t of spec.split(/\s+/)) if (t.startsWith("-")) excluded.push(t.slice(1)); return api; },
    skip(n) { ops.push((r) => r.slice(n)); return api; },
    limit(n) { ops.push((r) => r.slice(0, n)); return api; },
    lean: async () => { let r = getter(); if (!single) for (const op of ops) r = op(r); return project(clone(r)); },
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
  Model.findByIdAndUpdate = (id, u) => query(() => { const d = rows().find((x) => String(x._id) === String(id)); if (d) applyUpdate(d, u); return d || null; }, true);
  Model.deleteOne = async (f) => { const i = rows().findIndex((x) => match(x, f)); if (i >= 0) rows().splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; };
  Model.prototype.save = async function () { const o = this.toObject(); o._id = String(o._id); rows().push(o); return this; };
}

const MODELS = ["Buyer", "Admin", "Order", "Package", "Dispute", "DisputeMessage", "Review", "Notification",
  "DowryEstimation", "VisualRecommendation", "Banner", "BnplApplication", "BnplBank", "BnplOfferLetter",
  "BnplDocumentBundle", "BnplDocument", "BnplUser", "SellerPayout", "AdminWallet", "AdminCategory", "AuthSession", "Seller"];
const M = {};
for (const n of MODELS) { M[n] = require(`../../models/${n}`); fake(M[n], n); }

mongoose.connection.collection = (name) => {
  stores[`col:${name}`] = stores[`col:${name}`] || [];
  const rows = () => stores[`col:${name}`];
  return {
    findOne: async (f, o) => { const d = clone(rows().find((x) => match(x, f))); if (d && o?.projection) for (const [k, v] of Object.entries(o.projection)) if (v === 0) delete d[k]; return d || null; },
    updateOne: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); },
    findOneAndUpdate: async (f, u) => { const d = rows().find((x) => match(x, f)); if (d) applyUpdate(d, u); return clone(d); },
  };
};

// Native driver collections used by lib/inventory (seller_products / products).
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

// ── Seed data ───────────────────────────────────────────────────────────────

const later = new Date(Date.now() + 86400000);
function seed() {
  for (const k of Object.keys(stores)) stores[k].length = 0;
  stores.Buyer.push(
    { _id: "b1", buyer_id: "buyer_A", name: "Buyer A", email: "a@x.test", password_hash: "h", saved_addresses: [], wishlist_items: [] },
    { _id: "b2", buyer_id: "buyer_B", name: "Buyer B", email: "b@x.test", password_hash: "h", saved_addresses: [], wishlist_items: [] },
  );
  stores.Admin.push({ _id: "a1", admin_id: "admin_1", name: "Admin", email: "adm@x.test", password_hash: "h" });
  stores["col:sellers"] = [
    { seller_id: "sel_A", name: "Seller A", email: "sa@x.test", password_hash: "h" },
    { seller_id: "sel_B", name: "Seller B", email: "sb@x.test", password_hash: "h" },
  ];
  stores.Order.push(
    { _id: "o1", order_id: "ORD-A", buyer_id: "buyer_A", status: "CONFIRMED", items: [], total_amount: 100 },
    { _id: "o2", order_id: "ORD-B", buyer_id: "buyer_B", status: "CONFIRMED", items: [], total_amount: 200 },
  );
  stores.Package.push(
    { _id: "p1", package_id: "PKG-A", order_id: "ORD-A", seller_id: "sel_A", status: "CONFIRMED" },
    { _id: "p2", package_id: "PKG-B", order_id: "ORD-B", seller_id: "sel_B", status: "CONFIRMED" },
  );
  stores.Dispute.push(
    { _id: "d1", dispute_id: "DSP-A", order_id: "ORD-A", buyer_id: "buyer_A", seller_id: "sel_A", status: "SELLER_RESPONSE_PENDING", evidence: [], muted_roles: [], seller_response_deadline: later },
    { _id: "d2", dispute_id: "DSP-B", order_id: "ORD-B", buyer_id: "buyer_B", seller_id: "sel_B", status: "SELLER_RESPONSE_PENDING", evidence: [], muted_roles: [], seller_response_deadline: later },
  );
  stores.Notification.push(
    { _id: "nA", recipient_id: "buyer_A", recipient_role: "buyer", title: "A", read: false, type: "order" },
    { _id: "nB", recipient_id: "buyer_B", recipient_role: "buyer", title: "B", read: false, type: "order" },
    { _id: "nS", recipient_id: "sel_A", recipient_role: "seller", title: "S", read: false, type: "order" },
    { _id: "nAdm", recipient_id: "admin", recipient_role: "admin", title: "ADM", read: false, type: "order" },
  );
  stores.DowryEstimation.push(
    { _id: "estA", user_id: "buyer_A", category_budgets: {}, total_recommended_budget: 1 },
    { _id: "estB", user_id: "buyer_B", category_budgets: {}, total_recommended_budget: 2 },
  );
  stores.VisualRecommendation.push(
    { _id: "vA", user_id: "buyer_A", results: [] },
    { _id: "vB", user_id: "buyer_B", results: [] },
  );
  stores.Review.push(
    { _id: "rA", seller_id: "sel_A", product_id: "P-A", rating: 5, visible: false, buyer_id: "buyer_A" },
    { _id: "rB", seller_id: "sel_B", product_id: "P-B", rating: 4, visible: true, buyer_id: "buyer_B" },
  );
  stores.Banner.push(
    { _id: "bnA", banner_id: "BN-A", seller_id: "sel_A", seller_offer_status: "pending", image_url: "http://x/a.png", title: "A" },
    { _id: "bnB", banner_id: "BN-B", seller_id: "sel_B", seller_offer_status: "pending", image_url: "http://x/b.png", title: "B" },
  );
  stores.BnplApplication.push(
    { _id: "ba1", application_no: "BNPL-A", buyer_id: "buyer_A", order_id: "ORD-A", bank_id: "HBL", status: "PENDING_BANK_VERIFICATION" },
    { _id: "ba2", application_no: "BNPL-B", buyer_id: "buyer_B", order_id: "ORD-B", bank_id: "HBL", status: "PENDING_BANK_VERIFICATION" },
  );
  stores.BnplBank.push({ _id: "bk", bank_id: "HBL", name: "HBL", active: true });
  stores["native:seller_products"] = [
    { product_id: "P-A", seller_id: "sel_A", title: "Lehenga", price: 50000, discount_price: 45000, stock_quantity: 5, availability_status: "available" },
  ];
  stores["native:products"] = [];
  flaskProducts = {
    "P-A": { product_id: "P-A", seller_id: "sel_A", availability_status: "available", admin_approval_status: "" },
    "P-B": { product_id: "P-B", seller_id: "sel_B", availability_status: "available", admin_approval_status: "" },
    "P-FROZEN": { product_id: "P-FROZEN", seller_id: "sel_A", availability_status: "frozen" },
    "P-THRIFT": { product_id: "P-THRIFT", seller_id: "sel_A", availability_status: "hidden", admin_approval_status: "pending" },
  };
  flaskCalls = [];
}

// ── Flask stub (seller products) ────────────────────────────────────────────

let flaskProducts = {};
let flaskCalls = [];
const flask = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    const url = new URL(req.url, "http://x");
    flaskCalls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), raw });
    const m = url.pathname.match(/^\/seller\/product\/([^/]+)$/);
    if (m && req.method === "GET") return flaskProducts[m[1]] ? send(200, { success: true, product: flaskProducts[m[1]] }) : send(404, { success: false, error: "Product not found" });
    if (m && req.method === "PUT") return send(200, { success: true, product: { ...flaskProducts[m[1]], ...JSON.parse(raw || "{}") } });
    if (m && req.method === "DELETE") return send(200, { success: true, deleted: m[1] });
    if (url.pathname === "/seller/product" && req.method === "POST") return send(201, { success: true, product: { product_id: "P-NEW" } });
    if (url.pathname === "/seller/products") return send(200, { success: true, products: Object.values(flaskProducts).filter((p) => p.seller_id === url.searchParams.get("seller_id")) });
    if (url.pathname.startsWith("/seller/profile/")) return send(200, { success: true, seller: { seller_id: "sel_A", name: "Seller A" } });
    if (url.pathname === "/seller/all") return send(200, { success: true, sellers: [] });
    return send(404, { success: false });
  });
});

// ── App (built after the Flask stub is listening; sellerClient reads VISUAL_ML_URL at load) ─

let base;
let server;
test.before(async () => {
  await new Promise((r) => flask.listen(0, "127.0.0.1", r));
  process.env.VISUAL_ML_URL = `http://127.0.0.1:${flask.address().port}`;
  const { requireAdmin } = require("../../lib/auth");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/admin", require("../../routes/admin"));
  app.use("/api/buyer", require("../../routes/buyer"));
  app.use("/api/seller", require("../../routes/seller"));
  app.use("/api/orders", require("../../routes/orders"));
  app.use("/api/notifications", require("../../routes/notifications"));
  app.use("/api/disputes", require("../../routes/disputes"));
  app.use("/api/banners", require("../../routes/banners").router);
  app.use("/api/dowry", require("../../routes/dowry"));
  app.use("/api/visual", require("../../routes/visual"));
  app.use("/api/reviews", require("../../routes/reviews"));
  app.use("/api/bnpl", require("../../routes/bnpl"));
  app.get("/api/socket/status", requireAdmin, (req, res) => res.json({ success: true })); // mirrors server.js
  app.use((err, req, res, _n) => res.status(500).json({ success: false, error: String(err?.message || err) }));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server?.close(); flask.close(); });
test.beforeEach(seed);

// ── Helpers ─────────────────────────────────────────────────────────────────

const tok = (kind, sub) => tokens.signAccessToken({ sub, kind, tv: 0, sid: "sid-test" });
const T = {
  buyerA: () => tok("buyer", "buyer_A"),
  buyerB: () => tok("buyer", "buyer_B"),
  sellerA: () => tok("seller", "sel_A"),
  sellerB: () => tok("seller", "sel_B"),
  admin: () => tok("admin", "admin_1"),
};
const FORGED_ADMIN = { "x-user-id": "admin_1", "x-user-role": "admin" };
const FORGED_BUYER_B = { "x-user-id": "buyer_B", "x-user-role": "buyer" };
async function call(method, path, { token, headers = {}, body } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}
const denied = (s) => s === 403 || s === 404;
const authorized = (s) => s !== 401 && s !== 403;

// ── ADMIN: every admin route ────────────────────────────────────────────────

const ADMIN_ROUTES = [
  ["GET", "/api/admin/sellers"], ["GET", "/api/admin/sellers/sel_A/products"],
  ["DELETE", "/api/admin/product/P-A"], ["PATCH", "/api/admin/product/P-A/freeze"], ["PATCH", "/api/admin/product/P-A/unfreeze"],
  ["GET", "/api/admin/buyers"], ["GET", "/api/admin/stats"], ["GET", "/api/admin/products"],
  ["GET", "/api/admin/categories"], ["POST", "/api/admin/categories"],
  ["POST", "/api/admin/categories/c1/icon"], ["POST", "/api/admin/categories/c1/placeholder"],
  ["DELETE", "/api/admin/categories/c1"], ["PUT", "/api/admin/categories/c1"],
  ["POST", "/api/admin/categories/c1/subcategory"], ["PATCH", "/api/admin/categories/c1/prices"],
  ["POST", "/api/admin/categories/c1/subcategory/s1/field"], ["DELETE", "/api/admin/categories/c1/subcategory/s1/field/f1"],
  ["PATCH", "/api/admin/categories/c1/subcategory/s1/prices"],
  // adminExt
  ["GET", "/api/admin/orders"], ["GET", "/api/admin/orders/pending-release"], ["GET", "/api/admin/orders/ORD-A"],
  ["GET", "/api/admin/disputes"], ["POST", "/api/admin/orders/ORD-A/release-payment"], ["GET", "/api/admin/wallet"],
  ["GET", "/api/admin/wallet/orders/ORD-A"], ["GET", "/api/admin/sellers/sel_A/payouts"], ["GET", "/api/admin/bnpl/applications"],
  ["DELETE", "/api/admin/sellers/sel_A"], ["GET", "/api/admin/sales-timeline"], ["GET", "/api/admin/breakdown"],
  // other admin-only endpoints
  ["GET", "/api/banners"], ["POST", "/api/banners"], ["PUT", "/api/banners/BN-A"], ["DELETE", "/api/banners/BN-A"],
  ["PUT", "/api/banners/seller-offer/BN-A/approve"], ["PUT", "/api/banners/seller-offer/BN-A/reject"],
  ["POST", "/api/dowry/ml/init"], ["POST", "/api/dowry/training/seed"], ["GET", "/api/dowry/migrate-buyer-status"],
  ["GET", "/api/reviews/admin/all"], ["POST", "/api/visual/seed-demo"], ["PATCH", "/api/seller/product/P-A/thrift-approve"],
  ["GET", "/api/seller/by-email?email=sa@x.test"], ["GET", "/api/socket/status"],
];

test("ADMIN: every admin route → no JWT 401, buyer 403, seller 403, forged admin headers 401", async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const body = ["POST", "PUT", "PATCH"].includes(method) ? {} : undefined;
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path} no JWT`);
    assert.equal((await call(method, path, { body, headers: FORGED_ADMIN })).status, 401, `${method} ${path} forged headers`);
    assert.equal((await call(method, path, { body, token: T.buyerA() })).status, 403, `${method} ${path} buyer`);
    assert.equal((await call(method, path, { body, token: T.sellerA() })).status, 403, `${method} ${path} seller`);
  }
});

test("ADMIN: admin JWT is allowed on admin routes (identity from req.user)", async () => {
  for (const path of ["/api/admin/buyers", "/api/admin/orders", "/api/admin/disputes", "/api/banners",
    "/api/reviews/admin/all", "/api/socket/status", "/api/banners/seller-offers"]) {
    const r = await call("GET", path, { token: T.admin() });
    assert.equal(r.status, 200, `${path} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  const buyers = await call("GET", "/api/admin/buyers", { token: T.admin() });
  assert.ok(!JSON.stringify(buyers.body).includes("password_hash"));
});

test("ADMIN: legacy /api/admin/login is removed (410), not blocked by requireAdmin and never authenticates", async () => {
  const r = await call("POST", "/api/admin/login", { body: { email: "nobody@x.test", password: "x" } });
  assert.equal(r.status, 410);
  assert.equal(r.body.code, "ENDPOINT_REMOVED");
});

// ── BUYER IDOR ──────────────────────────────────────────────────────────────

test("IDOR buyer profile/data: own allowed, other buyer / seller denied, admin read-only", async () => {
  for (const path of ["/api/buyer/profile/buyer_A", "/api/buyer/buyer_A/full-data", "/api/buyer/buyer_A/saved-addresses"]) {
    assert.equal((await call("GET", path, { token: T.buyerA() })).status, 200, `own ${path}`);
    assert.equal((await call("GET", path, { token: T.buyerB() })).status, 403, `other ${path}`);
    assert.equal((await call("GET", path, { token: T.sellerA() })).status, 403, `seller ${path}`);
    assert.equal((await call("GET", path)).status, 401, `anon ${path}`);
    assert.equal((await call("GET", path, { token: T.admin() })).status, 200, `admin ${path}`);
  }
  for (const [m, path, body] of [["PATCH", "/api/buyer/buyer_B/wishlist-toggle", { product_id: "P" }],
    ["POST", "/api/buyer/buyer_B/recently-viewed", { product_id: "P" }], ["POST", "/api/buyer/buyer_B/cart-sync", { cart_items: [] }],
    ["POST", "/api/buyer/buyer_B/save-address", { line1: "x" }]]) {
    assert.equal((await call(m, path, { token: T.buyerA(), body })).status, 403, `buyer A mutating ${path}`);
    assert.equal((await call(m, path, { token: T.admin(), body })).status, 403, `admin cannot mutate ${path}`);
  }
  assert.equal((await call("PATCH", "/api/buyer/buyer_A/wishlist-toggle", { token: T.buyerA(), body: { product_id: "P1" } })).status, 200);
});

test("IDOR orders: list scoped to JWT; detail/packages require participant; admin allowed", async () => {
  const own = await call("GET", "/api/orders?buyer_id=buyer_A", { token: T.buyerA() });
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.orders.map((o) => o.order_id), ["ORD-A"]);
  const noQuery = await call("GET", "/api/orders", { token: T.buyerA() });
  assert.deepEqual(noQuery.body.orders.map((o) => o.order_id), ["ORD-A"], "no query → caller's own orders");
  assert.equal((await call("GET", "/api/orders?buyer_id=buyer_B", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/orders?seller_id=sel_A", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/orders?seller_id=sel_B", { token: T.sellerA() })).status, 403);
  const sellerOwn = await call("GET", "/api/orders?seller_id=sel_A", { token: T.sellerA() });
  assert.deepEqual(sellerOwn.body.packages.map((p) => p.package_id), ["PKG-A"]);
  assert.equal((await call("GET", "/api/orders?buyer_id=buyer_B")).status, 401);

  for (const p of ["/api/orders/ORD-B", "/api/orders/ORD-B/packages"]) {
    assert.equal((await call("GET", p, { token: T.buyerA() })).status, 403, `buyer A → ${p}`);
    assert.equal((await call("GET", p, { token: T.sellerA() })).status, 403, `seller A → ${p}`);
    assert.equal((await call("GET", p)).status, 401, `anon → ${p}`);
  }
  assert.equal((await call("GET", "/api/orders/ORD-A", { token: T.buyerA() })).status, 200);
  assert.equal((await call("GET", "/api/orders/ORD-A/packages", { token: T.sellerA() })).status, 200);
  assert.equal((await call("GET", "/api/orders/ORD-B", { token: T.admin() })).status, 200);
  assert.equal((await call("GET", "/api/orders/ORD-NOPE", { token: T.buyerA() })).status, 404);
});

test("ORDER create: seller_id and price come from the product record, not the client", async () => {
  const body = {
    items: [{ product_id: "P-A", seller_id: "sel_B", price: 1, discount_price: 1, qty: 2, title: "fake" }],
    shipping_address: { line1: "House 1", city: "Lahore", phone: "03001234567" },
    payment_method: "COD",
  };
  const r = await call("POST", "/api/orders", { token: T.buyerA(), body });
  assert.ok([200, 201].includes(r.status), `create → ${r.status} ${JSON.stringify(r.body)}`);
  const order = stores.Order.at(-1);
  assert.equal(order.buyer_id, "buyer_A");
  assert.equal(order.items[0].seller_id, "sel_A", "seller from DB, not body sel_B");
  assert.equal(order.items[0].price, 45000, "price from DB discount, not body 1");
  assert.equal(order.items[0].subtotal, 90000);
  assert.ok(stores.Package.some((p) => p.order_id === order.order_id && p.seller_id === "sel_A"));
  assert.ok(!stores.Package.some((p) => p.order_id === order.order_id && p.seller_id === "sel_B"));

  const unknown = await call("POST", "/api/orders", { token: T.buyerA(), body: { ...body, items: [{ product_id: "NOPE", seller_id: "sel_B", price: 1 }] } });
  assert.equal(unknown.status, 400);
  assert.equal((await call("POST", "/api/orders", { token: T.sellerA(), body })).status, 403);
  assert.equal((await call("POST", "/api/orders", { body, headers: FORGED_BUYER_B })).status, 401);
});

test("IDOR BNPL: other buyer's application not found; sellers/anonymous rejected", async () => {
  assert.equal((await call("GET", "/api/bnpl/applications/BNPL-B", { token: T.buyerA() })).status, 404);
  const own = await call("GET", "/api/bnpl/applications", { token: T.buyerA() });
  assert.equal(own.status, 200);
  assert.ok(!JSON.stringify(own.body).includes("BNPL-B"));
  assert.equal((await call("GET", "/api/bnpl/applications", { token: T.sellerA() })).status, 403);
  assert.equal((await call("GET", "/api/bnpl/applications", { headers: FORGED_BUYER_B })).status, 401);
  assert.equal((await call("POST", "/api/bnpl/applications/BNPL-B/accept-offer", { token: T.buyerA(), body: {} })).status, 404);
  assert.equal((await call("POST", "/api/bnpl/applications/BNPL-B/decline-offer", { token: T.buyerA(), body: {} })).status, 404);
});

// ── NOTIFICATIONS ───────────────────────────────────────────────────────────

test("NOTIFICATIONS: own data only; cross-user query/mutation denied; admin shared inbox kept", async () => {
  const own = await call("GET", "/api/notifications?user_id=buyer_A&role=buyer", { token: T.buyerA() });
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.notifications.map((n) => n.title), ["A"]);
  assert.deepEqual((await call("GET", "/api/notifications", { token: T.buyerA() })).body.notifications.map((n) => n.title), ["A"]);
  assert.equal((await call("GET", "/api/notifications?user_id=buyer_B&role=buyer", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/notifications?user_id=buyer_A&role=admin", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/notifications?user_id=buyer_B&role=buyer")).status, 401);
  assert.equal((await call("POST", "/api/notifications/nB/read", { token: T.buyerA(), body: {} })).status, 403);
  assert.equal(stores.Notification.find((n) => n._id === "nB").read, false, "other user's notification untouched");
  assert.equal((await call("POST", "/api/notifications/nA/read", { token: T.buyerA(), body: {} })).status, 200);
  assert.equal((await call("POST", "/api/notifications/read-all?user_id=buyer_B&role=buyer", { token: T.buyerA(), body: {} })).status, 403);
  await call("POST", "/api/notifications/read-all", { token: T.buyerA(), body: {} });
  assert.equal(stores.Notification.find((n) => n._id === "nB").read, false);
  const seller = await call("GET", "/api/notifications?user_id=sel_A&role=seller", { token: T.sellerA() });
  assert.deepEqual(seller.body.notifications.map((n) => n.title), ["S"]);
  const adm = await call("GET", "/api/notifications?user_id=admin&role=admin", { token: T.admin() });
  assert.deepEqual(adm.body.notifications.map((n) => n.title), ["ADM"]);
  assert.equal((await call("POST", "/api/notifications/nAdm/read", { token: T.admin(), body: {} })).status, 200);
  assert.equal((await call("POST", "/api/notifications/nAdm/read", { token: T.buyerA(), body: {} })).status, 403);
});

// ── DOWRY ───────────────────────────────────────────────────────────────────

test("DOWRY: anonymous estimation works; private data owner-only; body user_id ignored", async () => {
  const est = await call("POST", "/api/dowry/estimate", { body: {} });
  assert.ok(authorized(est.status), `anonymous estimate not blocked (${est.status})`);
  assert.ok(authorized((await call("POST", "/api/dowry/rule-only", { body: {} })).status));
  assert.equal((await call("GET", "/api/dowry/category-prices")).status !== 401, true);

  assert.equal((await call("GET", "/api/dowry/by-user/buyer_A", { token: T.buyerA() })).status, 200);
  assert.equal((await call("GET", "/api/dowry/history/buyer_A", { token: T.buyerA() })).status, 200);
  for (const p of ["/api/dowry/by-user/buyer_B", "/api/dowry/history/buyer_B"]) {
    assert.equal((await call("GET", p, { token: T.buyerA() })).status, 403, p);
    assert.equal((await call("GET", p, { token: T.sellerA() })).status, 403, p);
    assert.equal((await call("GET", p)).status, 401, p);
    assert.equal((await call("GET", p, { headers: FORGED_BUYER_B })).status, 401, p);
  }
  assert.equal((await call("GET", "/api/dowry/by-user/buyer_B", { token: T.admin() })).status, 200);
  assert.equal((await call("PATCH", "/api/dowry/budgets/buyer_B", { token: T.buyerA(), body: { category_budgets: {} } })).status, 403);
  assert.equal((await call("PATCH", "/api/dowry/budgets/buyer_B", { token: T.admin(), body: { category_budgets: {} } })).status, 403, "admin cannot mutate");
  assert.ok(authorized((await call("PATCH", "/api/dowry/budgets/buyer_A", { token: T.buyerA(), body: { category_budgets: {} } })).status));
  assert.equal((await call("GET", "/api/dowry/estB", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/dowry/estA", { token: T.buyerA() })).status, 200);
  assert.equal((await call("GET", "/api/dowry/estB", { token: T.admin() })).status, 200);
  assert.equal((await call("GET", "/api/dowry/estA")).status, 401);

  // save/upsert: body user_id can never plant data on another buyer
  const before = stores.DowryEstimation.filter((e) => e.user_id === "buyer_B").length;
  await call("POST", "/api/dowry/save", { token: T.buyerA(), body: { user_id: "buyer_B" } });
  await call("POST", "/api/dowry/save", { body: { user_id: "buyer_B" } });
  await call("POST", "/api/dowry/upsert", { token: T.buyerA(), body: { user_id: "buyer_B" } });
  assert.equal(stores.DowryEstimation.filter((e) => e.user_id === "buyer_B").length, before, "no estimation written for buyer_B");
});

// ── VISUAL ──────────────────────────────────────────────────────────────────

test("VISUAL: own history works; other buyer / seller / anonymous denied; admin read", async () => {
  const own = await call("GET", "/api/visual/history/buyer_A", { token: T.buyerA() });
  assert.equal(own.status, 200);
  assert.equal((await call("GET", "/api/visual/history/buyer_B", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/visual/history/buyer_A", { token: T.sellerA() })).status, 403);
  assert.equal((await call("GET", "/api/visual/history/buyer_A")).status, 401);
  assert.equal((await call("GET", "/api/visual/history/buyer_B", { token: T.admin() })).status, 200);
  assert.equal((await call("POST", "/api/visual/tryon", { body: {} })).status, 401, "paid try-on needs a login");
  assert.notEqual((await call("GET", "/api/visual/categories")).status, 401, "public visual endpoints stay public");
});

// ── PRODUCTS ────────────────────────────────────────────────────────────────

test("PRODUCT create: owner is the JWT seller even if body says seller B", async () => {
  const r = await call("POST", "/api/seller/product", { token: T.sellerA(), body: { seller_id: "sel_B", title: "X" } });
  assert.equal(r.status, 201);
  const sent = flaskCalls.find((c) => c.path === "/seller/product" && c.method === "POST");
  assert.match(sent.raw, /name="seller_id"\r\n\r\nsel_A\r\n/);
  assert.ok(!/name="seller_id"\r\n\r\nsel_B/.test(sent.raw));
  assert.equal((await call("POST", "/api/seller/product", { token: T.buyerA(), body: {} })).status, 403);
  assert.equal((await call("POST", "/api/seller/product", { body: {} })).status, 401);
});

test("PRODUCT update/delete: own allowed, other seller denied, admin allowed, never forwarded when denied", async () => {
  assert.equal((await call("PUT", "/api/seller/product/P-A", { token: T.sellerA(), body: { price: 10 } })).status, 200);
  assert.equal((await call("PUT", "/api/seller/product/P-B", { token: T.sellerA(), body: { price: 10 } })).status, 403);
  assert.equal((await call("DELETE", "/api/seller/product/P-A", { token: T.sellerA() })).status, 200);
  assert.equal((await call("DELETE", "/api/seller/product/P-B", { token: T.sellerA() })).status, 403);
  assert.ok(!flaskCalls.some((c) => c.path === "/seller/product/P-B" && c.method !== "GET"), "denied mutations never reach Flask");
  assert.equal((await call("PUT", "/api/seller/product/P-B", { token: T.admin(), body: { price: 1 } })).status, 200);
  assert.equal((await call("DELETE", "/api/seller/product/P-B", { token: T.admin() })).status, 200);
  assert.equal((await call("DELETE", "/api/seller/product/P-A", { token: T.buyerA() })).status, 403);
  assert.equal((await call("PUT", "/api/seller/product/P-NONE", { token: T.sellerA(), body: {} })).status, 404);
});

test("PRODUCT update: sellers cannot self-approve thrift, undo admin freeze, or change admin fields", async () => {
  const lastPut = (id) => JSON.parse(flaskCalls.filter((c) => c.path === `/seller/product/${id}` && c.method === "PUT").at(-1).raw);
  await call("PUT", "/api/seller/product/P-A", { token: T.sellerA(), body: { price: 5, admin_approval_status: "approved", marketplace_type: "new", seller_id: "sel_B" } });
  assert.deepEqual(Object.keys(lastPut("P-A")), ["price"]);
  await call("PUT", "/api/seller/product/P-FROZEN", { token: T.sellerA(), body: { availability_status: "available", price: 5 } });
  assert.deepEqual(lastPut("P-FROZEN"), { price: 5 });
  await call("PUT", "/api/seller/product/P-THRIFT", { token: T.sellerA(), body: { availability_status: "available" } });
  assert.deepEqual(lastPut("P-THRIFT"), {});
  await call("PUT", "/api/seller/product/P-A", { token: T.sellerA(), body: { availability_status: "hidden" } });
  assert.deepEqual(lastPut("P-A"), { availability_status: "hidden" });
  await call("PUT", "/api/seller/product/P-THRIFT", { token: T.admin(), body: { admin_approval_status: "approved" } });
  assert.deepEqual(lastPut("P-THRIFT"), { admin_approval_status: "approved" }, "admin fields still work for admins");
});

test("SELLER data: product list scoped to JWT seller; public endpoints stay public", async () => {
  const own = await call("GET", "/api/seller/products?seller_id=sel_A", { token: T.sellerA() });
  assert.equal(own.status, 200);
  assert.ok(own.body.products.every((p) => p.seller_id === "sel_A"));
  assert.equal((await call("GET", "/api/seller/products?seller_id=sel_B", { token: T.sellerA() })).status, 403);
  const noQuery = await call("GET", "/api/seller/products", { token: T.sellerA() });
  assert.equal(flaskCalls.filter((c) => c.path === "/seller/products").at(-1).query.seller_id, "sel_A");
  assert.equal(noQuery.status, 200);
  assert.equal((await call("GET", "/api/seller/products?seller_id=sel_A", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/seller/products?seller_id=sel_B", { token: T.admin() })).status, 200);
  assert.equal((await call("GET", "/api/seller/profile/sel_A")).status, 200, "public seller profile");
  assert.notEqual((await call("GET", "/api/seller/product/P-A")).status, 401, "public product detail");
});

test("SELLER offers: create uses JWT seller; list scoped; admin sees all", async () => {
  const r = await call("POST", "/api/banners/seller-offer", { token: T.sellerA(), body: { seller_id: "sel_B", seller_name: "Fake", title: "Sale", image_url: "http://x/i.png" } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); // existing handler returns 200
  const created = stores.Banner.at(-1);
  assert.equal(created.seller_id, "sel_A");
  assert.equal(created.seller_name, "Seller A");
  const mine = await call("GET", "/api/banners/seller-offers?status=pending", { token: T.sellerA() });
  assert.ok(mine.body.offers.length > 0 && mine.body.offers.every((o) => o.seller_id === "sel_A"));
  const all = await call("GET", "/api/banners/seller-offers?status=pending", { token: T.admin() });
  assert.ok(all.body.offers.some((o) => o.seller_id === "sel_B"));
  assert.equal((await call("GET", "/api/banners/seller-offers", { token: T.buyerA() })).status, 403);
  assert.equal((await call("POST", "/api/banners/seller-offer", { token: T.buyerA(), body: {} })).status, 403);
  assert.notEqual((await call("GET", "/api/banners/active")).status, 401, "active banners stay public");
});

// ── DISPUTES ────────────────────────────────────────────────────────────────

test("DISPUTES: list/detail participant-only; query identity cannot switch parties", async () => {
  const mine = await call("GET", "/api/disputes?role=buyer&id=buyer_A", { token: T.buyerA() });
  assert.deepEqual(mine.body.disputes.map((d) => d.dispute_id), ["DSP-A"]);
  assert.equal((await call("GET", "/api/disputes?role=buyer&id=buyer_B", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/disputes?role=admin&id=admin_1", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/disputes?role=seller&id=sel_B", { token: T.sellerA() })).status, 403);
  assert.equal((await call("GET", "/api/disputes?role=buyer&id=buyer_B")).status, 401);
  assert.equal((await call("GET", "/api/disputes?role=admin&id=admin_1", { token: T.admin() })).status, 200);

  assert.equal((await call("GET", "/api/disputes/DSP-B", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/disputes/DSP-B", { token: T.sellerA() })).status, 403);
  assert.equal((await call("GET", "/api/disputes/DSP-A", { token: T.buyerA() })).status, 200);
  assert.equal((await call("GET", "/api/disputes/DSP-A", { token: T.sellerA() })).status, 200);
  assert.equal((await call("GET", "/api/disputes/DSP-B", { token: T.admin() })).status, 200);
  assert.equal(((await call("GET", "/api/disputes/meta/sla")).status), 200, "SLA meta stays public");
});

test("DISPUTES messages: fake from_id / from_role are overridden; non-participant denied", async () => {
  const r = await call("POST", "/api/disputes/DSP-A/messages", { token: T.buyerA(), body: {
    from_role: "admin", from_id: "admin_1", from_name: "Admin (fake)", message: "hello" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const msg = stores.DisputeMessage.at(-1);
  assert.deepEqual([msg.sender_role, msg.sender_id, msg.sender_name], ["buyer", "buyer_A", "Buyer A"]);
  assert.equal((await call("POST", "/api/disputes/DSP-B/messages", { token: T.buyerA(), body: { message: "x", from_role: "buyer", from_id: "buyer_B" } })).status, 403);
  assert.equal((await call("POST", "/api/disputes/DSP-B/messages", { token: T.sellerA(), body: { message: "x" } })).status, 403);
  assert.equal((await call("POST", "/api/disputes/DSP-A/messages", { body: { message: "x", from_role: "admin", from_id: "admin_1" } })).status, 401);
  const adminMsg = await call("POST", "/api/disputes/DSP-B/messages", { token: T.admin(), body: { message: "admin here", from_role: "buyer" } });
  assert.equal(adminMsg.status, 201);
  assert.equal(stores.DisputeMessage.at(-1).sender_role, "admin");
});

test("DISPUTES evidence / seller-respond / buyer-review: ownership mandatory; fake buyer_id / seller_id ignored", async () => {
  assert.equal((await call("POST", "/api/disputes/DSP-B/evidence", { token: T.buyerA(), body: { from_id: "buyer_B", from_role: "buyer" } })).status, 403);
  assert.equal((await call("POST", "/api/disputes/DSP-A/evidence", { token: T.sellerA(), body: { from_role: "buyer" } })).status, 403);
  const ownEv = await call("POST", "/api/disputes/DSP-A/evidence", { token: T.buyerA(), body: {} });
  assert.equal(ownEv.status, 400, "owner passes auth; fails only on 'no files'");

  // seller B's dispute with a forged seller_id of seller B → denied (previously skipped when omitted/forged)
  const sr = { action: "accept_full_refund", note: "n" };
  assert.equal((await call("POST", "/api/disputes/DSP-B/seller-respond", { token: T.sellerA(), body: { ...sr, seller_id: "sel_B" } })).status, 403);
  assert.equal((await call("POST", "/api/disputes/DSP-B/seller-respond", { token: T.sellerA(), body: sr })).status, 403, "omitting seller_id no longer skips the check");
  assert.equal((await call("POST", "/api/disputes/DSP-A/seller-respond", { token: T.buyerA(), body: sr })).status, 403);

  assert.equal((await call("POST", "/api/disputes/DSP-B/buyer-review", { token: T.buyerA(), body: { buyer_id: "buyer_B", accept: true } })).status, 403);
  assert.equal((await call("POST", "/api/disputes/DSP-B/buyer-review", { token: T.buyerA(), body: { accept: true } })).status, 403);
  const ownReview = await call("POST", "/api/disputes/DSP-A/buyer-review", { token: T.buyerA(), body: { accept: true } });
  assert.ok(authorized(ownReview.status), `owner authorized (${ownReview.status})`);
  assert.equal((await call("POST", "/api/disputes/DSP-A/admin-decision", { token: T.buyerA(), body: {} })).status, 403);
});

// ── REVIEWS ─────────────────────────────────────────────────────────────────

test("REVIEWS: hidden seller reviews owner/admin only; AI + voice endpoints require auth; public reads stay public", async () => {
  assert.equal((await call("GET", "/api/reviews/seller/sel_A/all", { token: T.sellerA() })).status, 200);
  assert.equal((await call("GET", "/api/reviews/seller/sel_B/all", { token: T.sellerA() })).status, 403);
  assert.equal((await call("GET", "/api/reviews/seller/sel_A/all", { token: T.buyerA() })).status, 403);
  assert.equal((await call("GET", "/api/reviews/seller/sel_A/all", { token: T.admin() })).status, 200);
  assert.equal((await call("GET", "/api/reviews/seller/sel_A/all")).status, 401);
  assert.notEqual((await call("GET", "/api/reviews/seller/sel_A")).status, 401, "aggregate rating public");
  assert.notEqual((await call("GET", "/api/reviews/product/P-A")).status, 401, "product reviews public");
  assert.equal((await call("POST", "/api/reviews/ai/suggest-rating", { body: { text: "x" } })).status, 401);
  assert.equal((await call("POST", "/api/reviews/ai/generate-reviews", { body: {} })).status, 401);
  assert.equal((await call("POST", "/api/reviews/preview-voice", { token: T.sellerA(), body: { text: "x" } })).status, 403);
  assert.equal((await call("POST", "/api/reviews/preview-voice", { body: { text: "x", buyer_id: "buyer_B" } })).status, 401);
  // Review creation (orders/:id/review) is owner-scoped: buyer A cannot review buyer B's order
  assert.equal((await call("POST", "/api/orders/ORD-B/review", { token: T.buyerA(), body: { rating: 5 } })).status, 404);
});

// ── LEGACY HEADERS / ATTACK MATRIX ──────────────────────────────────────────

test("LEGACY: AUTH_LEGACY_HEADERS=false is enforced — forged headers alone are 401 everywhere", async () => {
  assert.equal(process.env.AUTH_LEGACY_HEADERS, "false");
  for (const [m, p] of [["GET", "/api/bnpl/applications"], ["GET", "/api/orders?buyer_id=buyer_B"], ["GET", "/api/admin/orders"],
    ["GET", "/api/seller/orders"], ["GET", "/api/notifications?user_id=buyer_B&role=buyer"], ["GET", "/api/disputes/DSP-B"]]) {
    assert.equal((await call(m, p, { headers: FORGED_ADMIN })).status, 401, `${p} admin headers`);
    assert.equal((await call(m, p, { headers: FORGED_BUYER_B })).status, 401, `${p} buyer headers`);
  }
});

test("ATTACK MATRIX: every decision follows the JWT identity", async () => {
  // 1. Buyer A JWT + Buyer B id
  assert.equal((await call("GET", "/api/buyer/buyer_B/full-data", { token: T.buyerA() })).status, 403);
  // 2. Seller A JWT + Seller B id
  assert.equal((await call("GET", "/api/reviews/seller/sel_B/all", { token: T.sellerA() })).status, 403);
  // 3. Buyer JWT + admin headers → still a buyer
  assert.equal((await call("GET", "/api/admin/buyers", { token: T.buyerA(), headers: FORGED_ADMIN })).status, 403);
  // 4. Seller JWT + admin headers → still a seller
  assert.equal((await call("GET", "/api/admin/wallet", { token: T.sellerA(), headers: FORGED_ADMIN })).status, 403);
  // 5. Admin JWT + buyer id/headers → still admin (read allowed, acts as admin)
  const adm = await call("GET", "/api/buyer/buyer_A/full-data", { token: T.admin(), headers: { "x-user-id": "buyer_A", "x-user-role": "buyer" } });
  assert.equal(adm.status, 200);
  assert.equal((await call("PATCH", "/api/buyer/buyer_A/wishlist-toggle", { token: T.admin(), headers: { "x-user-role": "buyer", "x-user-id": "buyer_A" }, body: { product_id: "P" } })).status, 403, "admin JWT is not turned into buyer_A");
  // 6. No JWT + forged identity headers
  assert.equal((await call("GET", "/api/bnpl/profile", { headers: FORGED_BUYER_B })).status, 401);
  // 7. Valid JWT + forged body identity
  await call("POST", "/api/disputes/DSP-A/messages", { token: T.buyerA(), body: { from_role: "seller", from_id: "sel_A", message: "m" } });
  assert.deepEqual([stores.DisputeMessage.at(-1).sender_role, stores.DisputeMessage.at(-1).sender_id], ["buyer", "buyer_A"]);
  // 8. Valid JWT + forged query identity
  assert.equal((await call("GET", "/api/notifications?user_id=buyer_B&role=buyer", { token: T.buyerA() })).status, 403);
  // 9. Valid JWT + forged URL identity
  assert.equal((await call("GET", "/api/dowry/history/buyer_B", { token: T.buyerA() })).status, 403);
  // Invalid Bearer + legacy headers → 401 (never falls back)
  assert.equal((await call("GET", "/api/admin/buyers", { token: "bad.token.here", headers: FORGED_ADMIN })).status, 401);
});
