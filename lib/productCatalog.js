/**
 * Read-only marketplace catalogue served directly from MongoDB.
 *
 * Used when the visual-ml-service is NOT deployed (VISUAL_ML_URL unset), so the
 * buyer marketplace still works. It mirrors the Flask endpoints exactly:
 *   GET /seller/products/public  -> mongo_seller.get_public_products()
 *   GET /seller/product/<id>     -> seller_routes.get_seller_product()
 *   GET /seller/search           -> seller_routes._run_tfidf_search() (plain text match,
 *                                   no TF-IDF vectors)
 * Writes (upload / update / delete) still require the Flask service.
 */
const mongoose = require("mongoose");

const PRODUCTS_COLLECTION = "seller_products";
// Same pattern as visual-ml-service/config.py RETIRED_CAT_RE.
const RETIRED_CAT_RE = /(jewel|jwel|accessar|second[_\-\s]?(hand|life|gear))/i;
const HIDDEN_FIELDS = { _id: 0, image_embeddings: 0, tfidf_vector: 0 };
const SORTS = {
  newest:     { created_at: -1 },
  price_asc:  { price: 1 },
  price_desc: { price: -1 },
};
const MAX_LIMIT = 100;

/** True when product reads should be served from MongoDB instead of Flask. */
function useLocalCatalog(env = process.env) {
  return !String(env.VISUAL_ML_URL || "").trim();
}

function _col() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return db.collection(PRODUCTS_COLLECTION);
}

function _str(v) {
  if (v === undefined || v === null) return null;
  const s = String(Array.isArray(v) ? v[0] : v).trim();
  return s || null;
}

function _num(v) {
  const s = _str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function _int(v, def, min, max) {
  const n = Number.parseInt(_str(v) ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function _escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _marketplaceClause(marketplaceType) {
  if (!marketplaceType || marketplaceType === "all") return null;
  if (marketplaceType === "new") {
    // Products missing the field are implicitly "new" (pre-migration rows).
    return { $or: [{ marketplace_type: "new" }, { marketplace_type: { $exists: false } }] };
  }
  return { marketplace_type: marketplaceType };
}

/** Build the Mongo filter for the public marketplace (pure; exported for tests). */
function buildPublicQuery(params = {}) {
  const query = {
    availability_status: "available",
    $nor: [{ major_category: RETIRED_CAT_RE }, { category: RETIRED_CAT_RE }],
  };
  const major = _str(params.major_category);
  const sub = _str(params.subcategory);
  const condition = _str(params.condition);
  const city = _str(params.city);
  const color = _str(params.color);
  if (major) query.major_category = major;
  if (sub) query.subcategory = sub;
  if (condition && condition !== "all") query.condition = condition;
  const mp = _marketplaceClause(_str(params.marketplace_type));
  if (mp) Object.assign(query, mp);
  if (city) query.city = { $regex: _escapeRe(city), $options: "i" };
  if (color) query.color = { $regex: _escapeRe(color), $options: "i" };
  const minPrice = _num(params.min_price);
  const maxPrice = _num(params.max_price);
  if (minPrice !== null || maxPrice !== null) {
    query.price = {};
    if (minPrice !== null) query.price.$gte = minPrice;
    if (maxPrice !== null) query.price.$lte = maxPrice;
  }
  return query;
}

async function getPublicProducts(params = {}) {
  const page = _int(params.page, 1, 1, 100000);
  const limit = _int(params.limit, 20, 1, MAX_LIMIT);
  const sort = SORTS[_str(params.sort_by)] || SORTS.newest;
  const query = buildPublicQuery(params);
  const col = _col();
  const [total, products] = await Promise.all([
    col.countDocuments(query),
    col.find(query, { projection: HIDDEN_FIELDS }).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
  ]);
  return { success: true, products, total, page, limit };
}

async function getProduct(productId) {
  const id = _str(productId);
  const product = id ? await _col().findOne({ product_id: id }, { projection: HIDDEN_FIELDS }) : null;
  if (!product) return { success: false, error: "Product not found" };
  return { success: true, product };
}

const SEARCH_FIELDS = ["title", "description", "subcategory", "item_type", "category", "brand", "color", "fabric", "material"];

/** Plain text relevance (0..1) used instead of TF-IDF. Exported for tests. */
function scoreProduct(product, q) {
  const text = SEARCH_FIELDS.map((f) => String(product[f] || "")).join(" ").toLowerCase().replace(/_/g, " ");
  const phrase = q.toLowerCase();
  const tokens = phrase.split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((t) => text.includes(t)).length;
  const title = String(product.title || "").toLowerCase();
  if (title.includes(phrase)) return 1;
  if (text.includes(phrase)) return 0.8;
  return hits / tokens.length >= 0.5 ? 0.6 * (hits / tokens.length) : 0;
}

async function searchProducts({ q, major_category, marketplace_type, limit } = {}) {
  const query = (_str(q) || "").slice(0, 200);
  if (query.length < 2) {
    return { success: false, error: "Query must be at least 2 characters", products: [] };
  }
  const max = _int(limit, 10, 1, 20);
  const filter = { availability_status: "available" };
  const major = _str(major_category);
  if (major) filter.major_category = major;
  const mp = _marketplaceClause(_str(marketplace_type));
  if (mp) Object.assign(filter, mp);
  const candidates = await _col().find(filter, { projection: HIDDEN_FIELDS }).limit(2000).toArray();
  const products = candidates
    .map((p) => ({ ...p, similarity_score: Math.round(scoreProduct(p, query) * 10000) / 10000 }))
    .filter((p) => p.similarity_score > 0)
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, max);
  return { success: true, products, total: products.length, query };
}

module.exports = {
  PRODUCTS_COLLECTION,
  useLocalCatalog,
  buildPublicQuery,
  scoreProduct,
  getPublicProducts,
  getProduct,
  searchProducts,
};
