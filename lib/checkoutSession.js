/**
 * Multi-seller checkout helpers.
 *
 * COD  → one Order ID per seller immediately (shared checkout_session_id + color)
 * BNPL → one combined Order for the BNPL application; after approval, split into
 *        per-seller Orders (parent marked superseded).
 */
const crypto = require("crypto");
const Order = require("../models/Order");
const Package = require("../models/Package");
const { generateOrderId } = require("./helpers");
const { notifySellerAndAdmin } = require("./notify");

const GROUP_COLORS = ["#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#DB2777"];

function newCheckoutSession() {
  const sessionId = `CHK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
  return { sessionId, color };
}

function makeSellerToken(orderId, buyerId) {
  return crypto
    .createHash("sha256")
    .update(`${orderId}|${buyerId}|${Date.now()}|${Math.random()}`)
    .digest("hex")
    .slice(0, 24);
}

function groupItemsBySeller(orderItems) {
  const bySeller = new Map();
  for (const it of orderItems) {
    if (!bySeller.has(it.seller_id)) bySeller.set(it.seller_id, []);
    bySeller.get(it.seller_id).push(it);
  }
  return bySeller;
}

async function createPackagesForOrder(order, { notify = true } = {}) {
  const existing = await Package.countDocuments({ order_id: order.order_id });
  if (existing > 0) return [];

  const sellerItems = order.items || [];
  const pkgSubtotal = sellerItems.reduce((n, i) => n + (i.subtotal || 0), 0);
  const sellerId = order.primary_seller_id || sellerItems[0]?.seller_id;
  if (!sellerId) return [];

  const pkg = await Package.create({
    package_id: `PEND-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    order_id: order.order_id,
    seller_id: sellerId,
    seller_name: "",
    items: sellerItems.map((i) => ({
      product_id: i.product_id,
      title: i.title,
      price: i.price,
      qty: i.qty,
      subtotal: i.subtotal,
      major_category: i.major_category || "",
      subcategory: i.subcategory || "",
    })),
    items_count: sellerItems.reduce((n, i) => n + (i.qty || 1), 0),
    subtotal: pkgSubtotal,
    shipping_method: order.delivery_method || "standard",
    shipping_cost: 0,
    distance_km: 0,
    status: "PENDING",
    admin_notified: true,
  });

  if (notify) {
    await notifySellerAndAdmin({
      seller_id: sellerId,
      title: "New Order Received",
      message: `You have received a new order ${order.order_id}. ${sellerItems.length} item(s), PKR ${pkgSubtotal.toLocaleString()}.`,
      type: "order",
      ref_id: order.order_id,
    }).catch(() => {});
  }
  return [pkg];
}

/**
 * After BNPL approval on a multi-seller combined order: create one Order per seller.
 * Parent order is marked superseded (kept for BNPL application linkage).
 */
async function splitCombinedBnplOrder(parentOrder, { by = "system", byId = "" } = {}) {
  const bySeller = groupItemsBySeller(parentOrder.items || []);
  if (bySeller.size <= 1) return [];

  const sessionId = parentOrder.checkout_session_id || newCheckoutSession().sessionId;
  const color = parentOrder.checkout_group_color || GROUP_COLORS[0];
  const children = [];

  // Remove placeholder packages on the combined parent (sellers get child packages)
  await Package.deleteMany({ order_id: parentOrder.order_id });

  let idx = 0;
  for (const [sellerId, sellerItems] of bySeller.entries()) {
    idx += 1;
    const subtotal = sellerItems.reduce((n, i) => n + (i.subtotal || 0), 0);
    // Pro-rate shipping + bank fee across sellers by subtotal share
    const share = parentOrder.subtotal > 0 ? subtotal / parentOrder.subtotal : 1 / bySeller.size;
    const shipping = Math.round((parentOrder.shipping_total || 0) * share);
    const bankFee = Math.round((parentOrder.bank_processing_fee || 0) * share);
    const childId = generateOrderId();

    const child = await Order.create({
      order_id: childId,
      buyer_id: parentOrder.buyer_id,
      buyer_name: parentOrder.buyer_name,
      buyer_email: parentOrder.buyer_email,
      buyer_phone: parentOrder.buyer_phone,
      items: sellerItems,
      items_count: sellerItems.reduce((n, i) => n + (i.qty || 1), 0),
      subtotal,
      shipping_total: shipping,
      total_amount: subtotal + shipping + bankFee,
      bank_processing_fee: bankFee,
      delivery_method: parentOrder.delivery_method,
      seller_view_token: makeSellerToken(childId, parentOrder.buyer_id),
      shipping_address: parentOrder.shipping_address,
      payment_method: "BNPL",
      payment_status: "PENDING",
      status: "CONFIRMED",
      bnpl_application_id: parentOrder.bnpl_application_id,
      primary_seller_id: sellerId,
      checkout_session_id: sessionId,
      checkout_group_color: color,
      split_from_order_id: parentOrder.order_id,
      timeline: [{
        status: "CONFIRMED",
        at: new Date(),
        by,
        by_id: byId,
        note: `Split from combined BNPL order ${parentOrder.order_id} (part ${idx}/${bySeller.size}).`,
      }],
    });

    await createPackagesForOrder(child, { notify: true });
    children.push(child);
  }

  parentOrder.superseded = true;
  parentOrder.status = "CANCELLED";
  parentOrder.payment_status = "CANCELLED";
  parentOrder.timeline.push({
    status: "CANCELLED",
    at: new Date(),
    by,
    by_id: byId,
    note: `Superseded by per-seller split orders: ${children.map((c) => c.order_id).join(", ")}.`,
  });
  await parentOrder.save();

  // Point BNPL application at first child for convenience (amount still matches parent)
  if (parentOrder.bnpl_application_id && children[0]) {
    try {
      const BnplApplication = require("../models/BnplApplication");
      await BnplApplication.updateOne(
        { application_no: parentOrder.bnpl_application_id },
        {
          $set: {
            order_id: children[0].order_id,
            linked_order_ids: children.map((c) => c.order_id),
          },
        }
      );
    } catch (_) { /* linked_order_ids may not exist on schema — ignore */ }
  }

  return children;
}

module.exports = {
  newCheckoutSession,
  makeSellerToken,
  groupItemsBySeller,
  createPackagesForOrder,
  splitCombinedBnplOrder,
  GROUP_COLORS,
};
