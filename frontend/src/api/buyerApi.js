const BASE = "http://localhost:5000/api/buyer";

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

export const BUYER_KEY = "ss_buyer";

export function getBuyerFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(BUYER_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveBuyerToStorage(buyer) {
  localStorage.setItem(BUYER_KEY, JSON.stringify(buyer));
}

export function clearBuyerFromStorage() {
  localStorage.removeItem(BUYER_KEY);
}

export default { registerBuyer, loginBuyer, getBuyerProfile, getBuyerFromStorage, saveBuyerToStorage, clearBuyerFromStorage };
