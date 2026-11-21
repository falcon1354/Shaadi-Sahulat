// Seller creation directly in MongoDB when visual-ml-service is not deployed (lib/sellerStore.js),
// and the routing in services/sellerClient.createSellerInternal (direct vs Flask).
process.env.JWT_ACCESS_SECRET ||= "test-access-secret-0123456789-abcdefghijklmnop";
process.env.INTERNAL_API_SECRET ||= "test-internal-secret-value-xyz";
process.env.FRONTEND_ORIGIN ||= "http://localhost:3000";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const HASH = bcrypt.hashSync("Correct-Horse-9", 4);

// ── fake `sellers` collection on mongoose.connection.db ──
let rows = [];
let failInsertWith = null;
const fakeCol = {
  findOne: async (q) => rows.find((r) => Object.entries(q).every(([k, v]) => r[k] === v)) || null,
  insertOne: async (doc) => { if (failInsertWith) throw failInsertWith; rows.push(structuredClone(doc)); return { insertedId: "x" }; },
};
let restoreDb;
test.before(() => {
  const desc = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
  Object.defineProperty(mongoose.connection, "db", { configurable: true, get: () => ({ collection: (n) => { assert.equal(n, "sellers"); return fakeCol; } }) });
  restoreDb = () => (desc ? Object.defineProperty(mongoose.connection, "db", desc) : delete mongoose.connection.db);
});
test.after(() => restoreDb());
test.beforeEach(() => { rows = []; failInsertWith = null; delete process.env.VISUAL_ML_URL; });

const store = require("../../lib/sellerStore");
const input = (over = {}) => ({
  name: "  Ayesha Boutique ", email: "  Ayesha@Example.COM ", phone: " 03001234567 ", city: " Lahore ",
  seller_type: "individual", password_hash: HASH,
  auth: { email_verified: true, token_version: 0, failed_logins: 0, password_changed_at: "2026-11-21T10:00:00.000Z", last_login_at: "2026-11-21T10:00:00.000Z" },
  ...over,
});

test("direct store is used only when VISUAL_ML_URL is unset/blank", () => {
  assert.equal(store.useDirectSellerStore({}), true);
  assert.equal(store.useDirectSellerStore({ VISUAL_ML_URL: "  " }), true);
  assert.equal(store.useDirectSellerStore({ VISUAL_ML_URL: "http://visual-ml.railway.internal:5002" }), false);
});

test("creates the same document shape as Flask create_seller; returns no secrets", async () => {
  const r = await store.createSellerDirect(input());
  assert.equal(r.success, true);
  assert.equal(rows.length, 1);
  const d = rows[0];
  assert.match(d.seller_id, /^sel_[0-9a-f]{12}$/);
  assert.equal(d.name, "Ayesha Boutique");
  assert.equal(d.email, "ayesha@example.com");
  assert.equal(d.phone, "03001234567");
  assert.equal(d.city, "Lahore");
  assert.equal(d.password_hash, HASH);
  assert.equal(d.seller_type, "individual");
  assert.equal(d.max_listings, 5);
  assert.equal(d.category_restriction, null);
  assert.equal(d.completed_orders, 0);
  assert.ok(d.created_at instanceof Date && d.updated_at instanceof Date);
  assert.equal(d.auth.email_verified, true);
  assert.equal(d.auth.token_version, 0);
  assert.equal(d.auth.failed_logins, 0);
  assert.ok(d.auth.password_changed_at instanceof Date && d.auth.last_login_at instanceof Date);
  for (const k of ["password_hash", "auth", "_id"]) assert.equal(k in r.seller, false, `${k} must not be returned`);
  assert.equal(r.seller.seller_id, d.seller_id);
});

test("seller_type rules: company → unlimited listings; unknown types → individual", async () => {
  assert.equal((await store.createSellerDirect(input({ seller_type: "company", email: "c@x.pk" }))).seller.max_listings, null);
  const odd = await store.createSellerDirect(input({ seller_type: "admin", email: "o@x.pk" }));
  assert.equal(odd.seller.seller_type, "individual");
  assert.equal(odd.seller.max_listings, 5);
});

test("auth sub-document is whitelisted with type checks (like Flask _clean_auth_state)", () => {
  const a = store.cleanAuthState({ email_verified: "yes", token_version: -1, failed_logins: 2.5, login_disabled: false, role: "admin", password_changed_at: "not-a-date" });
  assert.deepEqual(a, { token_version: 0, failed_logins: 0 });
});

test("duplicate email (case-insensitive) → EMAIL_IN_USE and nothing inserted", async () => {
  await store.createSellerDirect(input());
  const dup = await store.createSellerDirect(input({ email: "AYESHA@example.com" }));
  assert.deepEqual([dup.success, dup.code], [false, "EMAIL_IN_USE"]);
  assert.equal(rows.length, 1);
});

test("a duplicate-key error at insert time is reported as EMAIL_IN_USE", async () => {
  failInsertWith = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  const r = await store.createSellerDirect(input());
  assert.deepEqual([r.success, r.code], [false, "EMAIL_IN_USE"]);
});

test("invalid input is rejected before any write (plain password, bad email, empty name)", async () => {
  for (const bad of [{ password_hash: "PlainPassword123" }, { email: "not-an-email" }, { name: "   " }, { phone: 3001234567 }]) {
    const r = await store.createSellerDirect(input(bad));
    assert.equal(r.success, false, JSON.stringify(bad));
  }
  assert.equal(rows.length, 0);
});

test("sellerClient: VISUAL_ML_URL unset → direct MongoDB, no HTTP call", async () => {
  const sellerClient = require("../../services/sellerClient");
  const r = await sellerClient.createSellerInternal(input({ email: "direct@x.pk" }));
  assert.equal(r.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "direct@x.pk");
});

test("sellerClient: VISUAL_ML_URL set → Flask /seller/internal/create is still used (unchanged)", async () => {
  let hit = null;
  const flask = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)).on("end", () => {
      hit = { url: req.url, secret: req.headers["x-internal-secret"], body: JSON.parse(b || "{}") };
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, seller: { seller_id: "sel_fromflask01" } }));
    });
  });
  await new Promise((r) => flask.listen(0, "127.0.0.1", r));
  process.env.VISUAL_ML_URL = `http://127.0.0.1:${flask.address().port}`;
  try {
    const sellerClient = require("../../services/sellerClient");
    const r = await sellerClient.createSellerInternal(input({ email: "flask@x.pk" }));
    assert.equal(r.seller.seller_id, "sel_fromflask01");
    assert.equal(hit.url, "/seller/internal/create");
    assert.equal(hit.secret, process.env.INTERNAL_API_SECRET);
    assert.equal(rows.length, 0, "direct store not used when Flask is configured");
  } finally {
    flask.close();
  }
});
