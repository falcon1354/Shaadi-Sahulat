const BASE = "http://localhost:5000/api/admin";

function _adminHeaders(extra = {}) {
  let adminId = "admin_001";
  try {
    const adminRaw = localStorage.getItem("ss_admin") || localStorage.getItem("admin");
    if (adminRaw) {
      const parsed = JSON.parse(adminRaw);
      adminId = parsed.admin_id || parsed._id || parsed.id || adminId;
    }
  } catch {}
  return {
    "x-user-id": adminId,
    "x-user-role": "admin",
    ...extra,
  };
}

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
  const res = await fetch(`${BASE}/sellers`, { headers: _adminHeaders() });
  return res.json();
}

export async function getSellerProducts(seller_id) {
  const res = await fetch(`${BASE}/sellers/${seller_id}/products`, { headers: _adminHeaders() });
  return res.json();
}

export async function removeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}`, { method: "DELETE", headers: _adminHeaders() });
  return res.json();
}

export async function freezeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}/freeze`, { method: "PATCH", headers: _adminHeaders() });
  return res.json();
}

export async function unfreezeProduct(product_id) {
  const res = await fetch(`${BASE}/product/${product_id}/unfreeze`, { method: "PATCH", headers: _adminHeaders() });
  return res.json();
}

// ── Buyers ────────────────────────────────────────────────────────────────────
export async function getAllBuyers() {
  const res = await fetch(`${BASE}/buyers`, { headers: _adminHeaders() });
  return res.json();
}

// ── Financial ─────────────────────────────────────────────────────────────────
export async function getStats() {
  const res = await fetch(`${BASE}/stats`, { headers: _adminHeaders() });
  return res.json();
}

export async function getAllProducts({ major_category = "", page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (major_category) params.set("major_category", major_category);
  const res = await fetch(`${BASE}/products?${params}`, { headers: _adminHeaders() });
  return res.json();
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function getAdminCategories() {
  const res = await fetch(`${BASE}/categories`, { headers: _adminHeaders() });
  return res.json();
}

export async function addCategory(data, placeholderFile = null) {
  if (placeholderFile) {
    const form = new FormData();
    Object.entries(data || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) form.append(k, String(v));
    });
    form.append("placeholder", placeholderFile);
    const res = await fetch(`${BASE}/categories`, {
      method: "POST",
      headers: _adminHeaders(),
      body: form,
    });
    return res.json();
  }
  const res = await fetch(`${BASE}/categories`, {
    method: "POST",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function addSubcategory(category_id, data) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/subcategory`, {
    method: "POST",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSubcategory(category_id, subcategory_id) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/subcategory/${encodeURIComponent(subcategory_id)}`, {
    method: "DELETE",
    headers: _adminHeaders(),
  });
  return res.json();
}

export async function updateCategoryPrices(category_id, { price_min, price_max }) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/prices`, {
    method: "PATCH",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ price_min, price_max }),
  });
  return res.json();
}

export async function addCustomField(category_id, subcategory_id, field) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/subcategory/${encodeURIComponent(subcategory_id)}/field`, {
    method: "POST",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(field),
  });
  return res.json();
}

export async function removeCustomField(category_id, subcategory_id, field_id) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/subcategory/${encodeURIComponent(subcategory_id)}/field/${encodeURIComponent(field_id)}`, {
    method: "DELETE",
    headers: _adminHeaders(),
  });
  return res.json();
}

export async function updateSubcategoryPrices(category_id, subcategory_id, { price_min, price_max }) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/subcategory/${encodeURIComponent(subcategory_id)}/prices`, {
    method: "PATCH",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ price_min, price_max }),
  });
  return res.json();
}

export async function getSellerWithCounts() {
  const res = await fetch(`${BASE}/sellers`, { headers: _adminHeaders() });
  return res.json();
}

export async function editCategory(category_id, data) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}`, {
    method: "PUT",
    headers: _adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCategoryIcon(category_id, iconFile) {
  const form = new FormData();
  form.append('icon', iconFile);
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/icon`, {
    method: "POST",
    headers: _adminHeaders(),
    body: form,
  });
  return res.json();
}

export async function updateCategoryPlaceholder(category_id, placeholderFile) {
  const form = new FormData();
  form.append("placeholder", placeholderFile);
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}/placeholder`, {
    method: "POST",
    headers: _adminHeaders(),
    body: form,
  });
  return res.json();
}

export async function deleteCategory(category_id) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(category_id)}`, {
    method: "DELETE",
    headers: _adminHeaders(),
  });
  return res.json();
}

export default {
  loginAdmin, getAllSellers, getSellerProducts,
  removeProduct, freezeProduct, unfreezeProduct,
  getAllBuyers, getStats, getAllProducts, getSellerWithCounts,
  getAdminCategories, addCategory, addSubcategory, deleteSubcategory,
  updateCategoryPrices, addCustomField, removeCustomField, updateSubcategoryPrices,
  editCategory, updateCategoryIcon, updateCategoryPlaceholder, deleteCategory,
};
