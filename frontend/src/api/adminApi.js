const BASE = "http://localhost:5000/api/admin";

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginAdmin({ email, password }) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

// ── Sellers ───────────────────────────────────────────────────────────────────
export async function getAllSellers() {
  const res = await fetch(`${BASE}/sellers`);
  return res.json();
}

export async function getSellerProducts(seller_id) {
  const res = await fetch(`${BASE}/sellers/${seller_id}/products`);
  return res.json();
}

export async function removeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}`, { method: "DELETE" });
  return res.json();
}

export async function freezeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}/freeze`, { method: "PATCH" });
  return res.json();
}

export async function unfreezeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}/unfreeze`, { method: "PATCH" });
  return res.json();
}

// ── Buyers ────────────────────────────────────────────────────────────────────
export async function getAllBuyers() {
  const res = await fetch(`${BASE}/buyers`);
  return res.json();
}

// ── Financial ─────────────────────────────────────────────────────────────────
export async function getStats() {
  const res = await fetch(`${BASE}/stats`);
  return res.json();
}

export async function getAllProducts({ major_category = "", page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (major_category) params.set("major_category", major_category);
  const res = await fetch(`${BASE}/products?${params}`);
  return res.json();
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function getAdminCategories() {
  const res = await fetch(`${BASE}/categories`);
  return res.json();
}

export async function addCategory(data) {
  const res = await fetch(`${BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function addSubcategory(category_id, data) {
  const res = await fetch(`${BASE}/categories/${category_id}/subcategory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCategoryPrices(category_id, { price_min, price_max }) {
  const res = await fetch(`${BASE}/categories/${category_id}/prices`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price_min, price_max }),
  });
  return res.json();
}

export async function addCustomField(category_id, subcategory_id, field) {
  const res = await fetch(`${BASE}/categories/${category_id}/subcategory/${subcategory_id}/field`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(field),
  });
  return res.json();
}

export async function removeCustomField(category_id, subcategory_id, field_id) {
  const res = await fetch(`${BASE}/categories/${category_id}/subcategory/${subcategory_id}/field/${field_id}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function updateSubcategoryPrices(category_id, subcategory_id, { price_min, price_max }) {
  const res = await fetch(`${BASE}/categories/${category_id}/subcategory/${subcategory_id}/prices`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price_min, price_max }),
  });
  return res.json();
}

export async function getSellerWithCounts() {
  const res = await fetch(`${BASE}/sellers`);
  return res.json();
}

export default {
  loginAdmin, getAllSellers, getSellerProducts,
  removeProduct, freezeProduct, unfreezeProduct,
  getAllBuyers, getStats, getAllProducts, getSellerWithCounts,
  getAdminCategories, addCategory, addSubcategory,
  updateCategoryPrices, addCustomField, removeCustomField, updateSubcategoryPrices,
};
