// Tests for lib/productCatalog.js (MongoDB-backed marketplace reads when visual-ml-service is absent).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const catalog = require("../../lib/productCatalog");

// ── Minimal in-memory collection supporting the operators productCatalog uses ──
function matches(doc, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === "$or") { if (!v.some((s) => matches(doc, s))) return false; continue; }
    if (k === "$nor") { if (v.some((s) => matches(doc, s))) return false; continue; }
    const val = doc[k];
    if (v instanceof RegExp) { if (!(typeof val === "string" && v.test(val))) return false; continue; }
    if (v && typeof v === "object") {
      if ("$exists" in v && (val !== undefined) !== v.$exists) return false;
      if ("$regex" in v && !(typeof val === "string" && new RegExp(v.$regex, v.$options).test(val))) return false;
      if ("$gte" in v && !(val >= v.$gte)) return false;
      if ("$lte" in v && !(val <= v.$lte)) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}
function project(doc, projection = {}) {
  const out = { ...doc };
  for (const [k, v] of Object.entries(projection)) if (v === 0) delete out[k];
  return out;
}
function fakeCollection(docs) {
  return {
    countDocuments: async (q) => docs.filter((d) => matches(d, q)).length,
    findOne: async (q, opts = {}) => { const d = docs.find((x) => matches(x, q)); return d ? project(d, opts.projection) : null; },
    find(q, opts = {}) {
      let rows = docs.filter((d) => matches(d, q)).map((d) => project(d, opts.projection));
      const cur = {
        sort(spec) { const [[f, dir]] = Object.entries(spec); rows.sort((a, b) => (a[f] > b[f] ? dir : a[f] < b[f] ? -dir : 0)); return cur; },
        skip(n) { rows = rows.slice(n); return cur; },
        limit(n) { rows = rows.slice(0, n); return cur; },
        toArray: async () => rows,
      };
      return cur;
    },
  };
}

const NOW = Date.now();
const DOCS = [
  { _id: 1, product_id: "p1", title: "Red Bridal Lehenga", description: "zardozi work", major_category: "wedding_dress", subcategory: "bridal", marketplace_type: "new", price: 85000, city: "Lahore", color: "Red", condition: "new", availability_status: "available", created_at: new Date(NOW - 1000), image_embeddings: [1], tfidf_vector: { a: 1 } },
  { _id: 2, product_id: "p2", title: "Sheesham Sofa Set", description: "5 seater", major_category: "furniture", subcategory: "sofa_set", price: 120000, city: "Karachi", availability_status: "available", created_at: new Date(NOW - 2000) },
  { _id: 3, product_id: "p3", title: "Pre-loved Sharara", description: "worn once", major_category: "wedding_dress", subcategory: "bridal", marketplace_type: "thrift", price: 22000, availability_status: "available", created_at: new Date(NOW - 3000) },
  { _id: 4, product_id: "p4", title: "Hidden draft", major_category: "furniture", marketplace_type: "new", price: 1000, availability_status: "processing", created_at: new Date(NOW) },
  { _id: 5, product_id: "p5", title: "Gold Necklace", major_category: "jewelry", marketplace_type: "new", price: 5000, availability_status: "available", created_at: new Date(NOW) },
];

let restoreDb;
test.before(() => {
  const desc = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
  Object.defineProperty(mongoose.connection, "db", {
    configurable: true,
    get: () => ({ collection: (name) => { assert.equal(name, "seller_products"); return fakeCollection(DOCS); } }),
  });
  restoreDb = () => (desc ? Object.defineProperty(mongoose.connection, "db", desc) : delete mongoose.connection.db);
});
test.after(() => restoreDb());

test("useLocalCatalog only when VISUAL_ML_URL is unset/blank", () => {
  assert.equal(catalog.useLocalCatalog({}), true);
  assert.equal(catalog.useLocalCatalog({ VISUAL_ML_URL: "  " }), true);
  assert.equal(catalog.useLocalCatalog({ VISUAL_ML_URL: "http://visual-ml.railway.internal:5002" }), false);
});

test("public listing: only available, non-retired products; hidden fields stripped; newest first", async () => {
  const r = await catalog.getPublicProducts({});
  assert.equal(r.success, true);
  assert.deepEqual(r.products.map((p) => p.product_id), ["p1", "p2", "p3"]);
  assert.equal(r.total, 3);
  for (const p of r.products) {
    assert.equal(p._id, undefined); assert.equal(p.image_embeddings, undefined); assert.equal(p.tfidf_vector, undefined);
  }
});

test("marketplace_type=new includes products missing the field, excludes thrift", async () => {
  const r = await catalog.getPublicProducts({ marketplace_type: "new" });
  assert.deepEqual(r.products.map((p) => p.product_id).sort(), ["p1", "p2"]);
  const t = await catalog.getPublicProducts({ marketplace_type: "thrift" });
  assert.deepEqual(t.products.map((p) => p.product_id), ["p3"]);
});

test("category, subcategory, price, city filters, sort and pagination", async () => {
  assert.deepEqual((await catalog.getPublicProducts({ major_category: "furniture" })).products.map((p) => p.product_id), ["p2"]);
  assert.deepEqual((await catalog.getPublicProducts({ subcategory: "bridal", marketplace_type: "new" })).products.map((p) => p.product_id), ["p1"]);
  assert.deepEqual((await catalog.getPublicProducts({ min_price: "20000", max_price: "90000", sort_by: "price_asc" })).products.map((p) => p.product_id), ["p3", "p1"]);
  assert.deepEqual((await catalog.getPublicProducts({ city: "lah" })).products.map((p) => p.product_id), ["p1"]);
  assert.deepEqual((await catalog.getPublicProducts({ sort_by: "price_desc", page: "2", limit: "1" })).products.map((p) => p.product_id), ["p1"]);
  const r = await catalog.getPublicProducts({ page: "abc", limit: "100000" });
  assert.equal(r.page, 1); assert.equal(r.limit, 100);
});

test("query values are coerced to strings and regex input is escaped (no operator injection)", () => {
  const q = catalog.buildPublicQuery({ major_category: { $ne: null }, city: ".*(" });
  assert.equal(q.major_category, "[object Object]");
  assert.equal(q.city.$regex, "\\.\\*\\(");
});

test("product detail: found / not found, hidden fields stripped", async () => {
  const ok = await catalog.getProduct("p1");
  assert.equal(ok.success, true); assert.equal(ok.product.title, "Red Bridal Lehenga"); assert.equal(ok.product.image_embeddings, undefined);
  const missing = await catalog.getProduct("nope");
  assert.deepEqual(missing, { success: false, error: "Product not found" });
});

test("search: min length, relevance order, filters, available only", async () => {
  assert.equal((await catalog.searchProducts({ q: "a" })).success, false);
  const r = await catalog.searchProducts({ q: "bridal" });
  assert.equal(r.success, true);
  assert.deepEqual(r.products.map((p) => p.product_id).sort(), ["p1", "p3"]);
  assert.ok(r.products[0].similarity_score > 0);
  assert.deepEqual((await catalog.searchProducts({ q: "lehenga" })).products.map((p) => p.product_id), ["p1"]);
  assert.deepEqual((await catalog.searchProducts({ q: "bridal", marketplace_type: "thrift" })).products.map((p) => p.product_id), ["p3"]);
  assert.equal((await catalog.searchProducts({ q: "hidden draft" })).products.length, 0);
});
