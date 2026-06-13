/**
 * ShaadiSahulat - Seller API Client
 * ===================================
 * All calls go through the Node.js backend at port 5000.
 * Images uploaded to the ML Flask service are served from port 5002.
 */

const BASE_URL   = "http://localhost:5000/api/seller";
export const ML_URL = "http://localhost:5002";

// ── Seller registration / auth ────────────────────────────────────────────

export async function registerSeller({ name, email, password, phone, city }) {
  const res = await fetch(`${BASE_URL}/register`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name, email, password, phone, city }),
  });
  return res.json();
}

export async function loginSeller({ email, password }) {
  const res = await fetch(`${BASE_URL}/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function getSellerByEmail(email) {
  const res = await fetch(`${BASE_URL}/by-email?email=${encodeURIComponent(email)}`);
  return res.json();
}

export async function getSellerProfile(sellerId) {
  const res = await fetch(`${BASE_URL}/profile/${sellerId}`);
  return res.json();
}

// ── Category tree ─────────────────────────────────────────────────────────

export async function getCategories() {
  const res = await fetch(`${BASE_URL}/categories`);
  return res.json();
}

// ── Product management ────────────────────────────────────────────────────

/**
 * Upload a new product with images.
 *
 * @param {Object} fields  — all product fields including major_category, subcategory, etc.
 * @param {File[]} images  — File objects from <input type="file">
 */
export async function uploadProduct(fields, images) {
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null && val !== "") {
      form.append(key, String(val));
    }
  }
  for (const img of images) {
    form.append("images", img);
  }
  const res = await fetch(`${BASE_URL}/product`, { method: "POST", body: form });
  return res.json();
}

export async function listProducts({ sellerId, category, majorCategory, status, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (sellerId)       params.set("seller_id",      sellerId);
  if (majorCategory)  params.set("major_category", majorCategory);
  if (category)       params.set("category",       category);
  if (status)         params.set("status",         status);
  params.set("page",  page);
  params.set("limit", limit);
  const res = await fetch(`${BASE_URL}/products?${params}`);
  return res.json();
}

/**
 * Fetch available products for the buyer marketplace.
 * Supports: major_category, subcategory, min_price, max_price,
 *           color, condition, city, sort_by, page, limit
 */
export async function getPublicProducts(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const res = await fetch(`${BASE_URL}/products/public?${params}`);
  return res.json();
}

export async function getProduct(productId) {
  const res = await fetch(`${BASE_URL}/product/${productId}`);
  return res.json();
}

export async function updateProduct(productId, updates) {
  const res = await fetch(`${BASE_URL}/product/${productId}`, {
    method:  "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteProduct(productId) {
  const res = await fetch(`${BASE_URL}/product/${productId}`, { method: "DELETE" });
  return res.json();
}

export async function searchProducts({ q, major_category, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (major_category) params.set("major_category", major_category);
  params.set("limit", limit);
  const res = await fetch(`${BASE_URL}/search?${params}`);
  return res.json();
}

export async function getPriceSuggestion({ major_category, subcategory, item_type, color, condition } = {}) {
  const params = new URLSearchParams();
  if (major_category) params.set("major_category", major_category);
  if (subcategory)    params.set("subcategory",    subcategory);
  if (item_type)      params.set("item_type",      item_type);
  if (color)          params.set("color",           color);
  if (condition)      params.set("condition",       condition);
  const res = await fetch(`${BASE_URL}/price-suggestion?${params}`);
  return res.json();
}

// ── Image URL helper ──────────────────────────────────────────────────────

export function resolveImageUrl(imageUrl) {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${ML_URL}${imageUrl}`;
}

export default {
  registerSeller,
  loginSeller,
  getSellerByEmail,
  getSellerProfile,
  getCategories,
  uploadProduct,
  listProducts,
  getPublicProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getPriceSuggestion,
  resolveImageUrl,
};
