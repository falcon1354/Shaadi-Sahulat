const BASE = "http://localhost:5000/api/buyer";
const DOWRY_BASE = "http://localhost:5000/api/dowry";

export async function registerBuyer({ name, email, password, phone = "", city = "" }) {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name, email, password, phone, city }),
  });
  return res.json();
}

export async function loginBuyer({ email, password }) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function getBuyerProfile(buyerId) {
  const res = await fetch(`${BASE}/profile/${buyerId}`);
  return res.json();
}

/** Toggle wishlist item — backend adds or removes. Returns updated wishlist_items[]. */
export async function toggleWishlistItem(buyerId, item) {
  const res = await fetch(`${BASE}/${buyerId}/wishlist-toggle`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(item),
  });
  return res.json();
}

/** Record a recently viewed product in DB. */
export async function recordRecentlyViewed(buyerId, item) {
  try {
    await fetch(`${BASE}/${buyerId}/recently-viewed`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(item),
    });
  } catch { /* non-critical, ignore */ }
}

/** Persist updated category_budgets to MongoDB after shift or checkout. */
export async function patchDowryBudgets(buyerId, category_budgets) {
  try {
    const res = await fetch(`${DOWRY_BASE}/budgets/${buyerId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ category_budgets }),
    });
    return res.json();
  } catch { return { success: false }; }
}

export const BUYER_KEY = "ss_buyer";

export function getBuyerFromStorage() {
  try { return JSON.parse(localStorage.getItem(BUYER_KEY) || "null"); }
  catch { return null; }
}

export function saveBuyerToStorage(buyer) {
  localStorage.setItem(BUYER_KEY, JSON.stringify(buyer));
}

export function clearBuyerFromStorage() {
  localStorage.removeItem(BUYER_KEY);
}

export default {
  registerBuyer, loginBuyer, getBuyerProfile,
  toggleWishlistItem, recordRecentlyViewed, patchDowryBudgets,
  getBuyerFromStorage, saveBuyerToStorage, clearBuyerFromStorage,
};
