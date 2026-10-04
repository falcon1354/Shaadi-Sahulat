/**
 * Order API client — buyer + seller endpoints.
 */
import { authFetch } from "./http";
const BASE = "http://localhost:5000/api/orders";

// Identity is sent as `Authorization: Bearer <token>` by authFetch (src/api/http.js).
// buyerId / sellerId parameters are kept for call-site compatibility.

// ---------- Buyer ----------
export async function createOrder({
  buyerId, items, shippingAddress, paymentMethod, bnplApplicationId,
  bankProcessingFee, deliveryMethod, shippingCost,
}) {
  const res = await authFetch(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      shipping_address: shippingAddress,
      payment_method: paymentMethod,
      bnpl_application_id: bnplApplicationId || "",
      bank_processing_fee: bankProcessingFee || 0,
      delivery_method: deliveryMethod || "standard",
      shipping_cost: shippingCost || 0,
    }),
  });
  return res.json();
}

export async function listBuyerOrders(buyerId, { page = 1, limit = 20 } = {}) {
  const res = await authFetch(`${BASE}/?buyer_id=${buyerId}&page=${page}&limit=${limit}`);
  return res.json();
}

export async function getOrder(orderId) {
  const res = await authFetch(`${BASE}/${orderId}`);
  return res.json();
}

export async function buyerConfirm({
  buyerId, orderId, confirmation, problemType, title, description,
}) {
  const res = await authFetch(`${BASE}/${orderId}/buyer-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmation,
      problem_type: problemType,
      title,
      description,
    }),
  });
  return res.json();
}

export async function submitReview({
  buyerId, orderId, rating, comment, recommend,
  title, ai_suggested_rating, ai_used, ai_generated, ai_provider,
  voice_agent, skip_voice,
}) {
  const res = await authFetch(`${BASE}/${orderId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rating, comment, recommend,
      title, ai_suggested_rating, ai_used, ai_generated, ai_provider,
      voice_agent,
      skip_voice: !!skip_voice,
    }),
  });
  return res.json();
}

// ---------- Seller ----------
export async function listSellerPackages(sellerId) {
  const res = await authFetch(`${BASE}/?seller_id=${sellerId}`);
  return res.json();
}

export async function getPackageLocation(sellerId, packageId) {
  const res = await authFetch(`${BASE}/packages/${packageId}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function markPreparing(sellerId, packageId) {
  const res = await authFetch(`${BASE}/packages/${packageId}/preparing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function markShipped(sellerId, packageId, {
  shippingMethod, courierCompany, trackingNumber, distanceKm, sellerNote,
}) {
  const res = await authFetch(`${BASE}/packages/${packageId}/shipping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipping_method: shippingMethod,
      courier_company: courierCompany,
      tracking_number: trackingNumber,
      distance_km: distanceKm,
      seller_note: sellerNote,
    }),
  });
  return res.json();
}

export async function markDelivered(sellerId, packageId, { deliveryNote, recipientName }) {
  const res = await authFetch(`${BASE}/packages/${packageId}/delivered`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delivery_note: deliveryNote, recipient_name: recipientName }),
  });
  return res.json();
}

// ---------- Order by seller view token (capability token; no account identity needed) ----------
// Used by the Seller Order Detail Page, which is opened via
// /seller/orders/:orderId?t=<token>. The token (Order.seller_view_token)
// is the only auth required to read this order + its packages.
export async function getOrderByToken(token) {
  const res = await authFetch(`${BASE}/by-token/${encodeURIComponent(token)}`);
  return res.json();
}

export default {
  createOrder, listBuyerOrders, getOrder, buyerConfirm, submitReview,
  listSellerPackages, getPackageLocation, markPreparing, markShipped, markDelivered,
  getOrderByToken,
  // Alias: listSellerOrders === listSellerPackages (a package === a seller's fulfillment unit per order)
  listSellerOrders: listSellerPackages,
};
