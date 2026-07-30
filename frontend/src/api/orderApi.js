/**
 * Order API client — buyer + seller endpoints.
 */
const BASE = "http://localhost:5000/api/orders";

function _buyerHeaders(buyerId) {
  return { "x-user-id": buyerId, "x-user-role": "buyer" };
}
function _sellerHeaders(sellerId) {
  return { "x-user-id": sellerId, "x-user-role": "seller" };
}

// ---------- Buyer ----------
export async function createOrder({
  buyerId, items, shippingAddress, paymentMethod, bnplApplicationId,
  bankProcessingFee, deliveryMethod,
}) {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { ..._buyerHeaders(buyerId), "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      shipping_address: shippingAddress,
      payment_method: paymentMethod,
      bnpl_application_id: bnplApplicationId || "",
      bank_processing_fee: bankProcessingFee || 0,
      delivery_method: deliveryMethod || "standard",
    }),
  });
  return res.json();
}

export async function listBuyerOrders(buyerId, { page = 1, limit = 20 } = {}) {
  const res = await fetch(`${BASE}/?buyer_id=${buyerId}&page=${page}&limit=${limit}`);
  return res.json();
}

export async function getOrder(orderId) {
  const res = await fetch(`${BASE}/${orderId}`);
  return res.json();
}

export async function buyerConfirm({
  buyerId, orderId, confirmation, problemType, title, description,
}) {
  const res = await fetch(`${BASE}/${orderId}/buyer-confirm`, {
    method: "POST",
    headers: { ..._buyerHeaders(buyerId), "Content-Type": "application/json" },
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
}) {
  const res = await fetch(`${BASE}/${orderId}/review`, {
    method: "POST",
    headers: { ..._buyerHeaders(buyerId), "Content-Type": "application/json" },
    body: JSON.stringify({
      rating, comment, recommend,
      title, ai_suggested_rating, ai_used, ai_generated, ai_provider,
    }),
  });
  return res.json();
}

// ---------- Seller ----------
export async function listSellerPackages(sellerId) {
  const res = await fetch(`${BASE}/?seller_id=${sellerId}`);
  return res.json();
}

export async function getPackageLocation(sellerId, packageId) {
  const res = await fetch(`${BASE}/packages/${packageId}/location`, {
    method: "POST",
    headers: { ..._sellerHeaders(sellerId), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function markPreparing(sellerId, packageId) {
  const res = await fetch(`${BASE}/packages/${packageId}/preparing`, {
    method: "POST",
    headers: { ..._sellerHeaders(sellerId), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function markShipped(sellerId, packageId, {
  shippingMethod, courierCompany, trackingNumber, distanceKm, sellerNote,
}) {
  const res = await fetch(`${BASE}/packages/${packageId}/shipping`, {
    method: "POST",
    headers: { ..._sellerHeaders(sellerId), "Content-Type": "application/json" },
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
  const res = await fetch(`${BASE}/packages/${packageId}/delivered`, {
    method: "POST",
    headers: { ..._sellerHeaders(sellerId), "Content-Type": "application/json" },
    body: JSON.stringify({ delivery_note: deliveryNote, recipient_name: recipientName }),
  });
  return res.json();
}

export default {
  createOrder, listBuyerOrders, getOrder, buyerConfirm, submitReview,
  listSellerPackages, getPackageLocation, markPreparing, markShipped, markDelivered,
};
