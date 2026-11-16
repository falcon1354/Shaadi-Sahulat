/**
 * Polar.sh card payments.
 * Identity is the buyer/admin access token (authFetch). Prices are calculated
 * on the server from the product catalog.
 */
import { authFetch } from "./http";
import { apiUrl } from "./base";

const BASE = apiUrl("/api/payments");

async function read(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data && !data.error) data.error = `Payment request failed (${res.status})`;
  return data;
}

export async function getPaymentConfig() {
  const res = await fetch(`${BASE}/config`);
  return read(res);
}

export async function createPolarCheckout({ items, shippingAddress, deliveryMethod }) {
  const res = await authFetch(`${BASE}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      shipping_address: shippingAddress,
      delivery_method: deliveryMethod,
    }),
  });
  return read(res);
}

export async function syncPolarCheckout(checkoutId) {
  const res = await authFetch(`${BASE}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkout_id: checkoutId }),
  });
  return read(res);
}

export async function listMyPayments() {
  const res = await authFetch(`${BASE}/mine`);
  return read(res);
}

export async function listAdminPayments() {
  const res = await authFetch(`${BASE}/admin`);
  return read(res);
}

export async function refundPolarPayment(transactionId, { reason, comment } = {}) {
  const res = await authFetch(`${BASE}/admin/${encodeURIComponent(transactionId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || "customer_request", comment: comment || "" }),
  });
  return read(res);
}
