import { authFetch } from "./http";
const BASE = "http://localhost:5000/api/buyer";
const DOWRY_BASE = "http://localhost:5000/api/dowry";

// Registration / login: see src/context/AuthContext.jsx (POST /api/auth/buyer/register, /api/auth/login).

export async function getBuyerProfile(buyerId) {
  const res = await authFetch(`${BASE}/profile/${buyerId}`);
  return res.json();
}

/** Toggle wishlist item — backend adds or removes. Returns updated wishlist_items[]. */
export async function toggleWishlistItem(buyerId, item) {
  const res = await authFetch(`${BASE}/${buyerId}/wishlist-toggle`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(item),
  });
  return res.json();
}

/** Record a recently viewed product in DB. */
export async function recordRecentlyViewed(buyerId, item) {
  try {
    await authFetch(`${BASE}/${buyerId}/recently-viewed`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(item),
    });
  } catch { /* non-critical, ignore */ }
}

/** Sync full cart to MongoDB (called on checkout or when cart changes). */
export async function syncCart(buyerId, cart_items) {
  try {
    await authFetch(`${BASE}/${buyerId}/cart-sync`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ cart_items }),
    });
  } catch { /* non-critical */ }
}

/** Fetch buyer profile + latest dowry + cart from MongoDB. */
export async function getFullBuyerData(buyerId) {
  try {
    const res = await authFetch(`${BASE}/${buyerId}/full-data`);
    return res.json();
  } catch { return { success: false }; }
}

/** Persist updated category_budgets to MongoDB after shift or checkout. */
export async function patchDowryBudgets(buyerId, category_budgets) {
  try {
    const res = await authFetch(`${DOWRY_BASE}/budgets/${buyerId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ category_budgets }),
    });
    return res.json();
  } catch { return { success: false }; }
}

// ── Saved Addresses ──────────────────────────────────────────────────────────

export async function saveAddress(buyerId, address) {
  const res = await authFetch(`${BASE}/${buyerId}/addresses`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(address),
  });
  return res.json();
}

export async function getSavedAddresses(buyerId) {
  const res = await authFetch(`${BASE}/${buyerId}/addresses`);
  return res.json();
}

export default {
  getBuyerProfile, getFullBuyerData,
  toggleWishlistItem, recordRecentlyViewed, patchDowryBudgets, syncCart,
  saveAddress, getSavedAddresses,
};
