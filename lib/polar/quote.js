/**
 * Server-side cart quote for a Polar checkout.
 * Prices, seller ids, and shipping come from the database — never the client.
 */
const Buyer = require("../../models/Buyer");
const { validatePhone } = require("../helpers");
const { resolveDelivery } = require("../shipping");
const { findProduct, isOrderable } = require("../inventory");
const { toMinor } = require("./money");

class QuoteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function quotePolarCart({ buyerId, items, shippingAddress, deliveryMethod }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new QuoteError(400, "items array is required");
  }
  if (items.length > 50) {
    throw new QuoteError(400, "Too many items in one card payment");
  }
  if (!shippingAddress || !shippingAddress.line1 || !shippingAddress.city) {
    throw new QuoteError(400, "shipping_address.line1 and .city are required");
  }

  const buyer = await Buyer.findOne({ buyer_id: buyerId }).lean();
  if (!buyer) throw new QuoteError(404, "Buyer not found");

  const shippingPhone = String(shippingAddress.phone || buyer.phone || "").replace(/\D/g, "");
  if (!validatePhone(shippingPhone)) {
    throw new QuoteError(400, "Phone number must be 11 digits starting with 03");
  }

  const delivery = resolveDelivery(deliveryMethod);
  if (!delivery) {
    throw new QuoteError(400, "delivery_method must be standard or express");
  }

  let subtotal = 0;
  const orderItems = [];
  for (const it of items) {
    const productId = typeof it?.product_id === "string" ? it.product_id : "";
    const found = productId ? await findProduct(productId) : null;
    if (!found || !found.doc?.seller_id || !(await isOrderable(found.doc))) {
      throw new QuoteError(400, `Product not available: ${productId || "(missing id)"}`);
    }
    const p = found.doc;
    const listPrice = Number(p.price) || 0;
    const dbDiscount = Number(p.discount_price);
    const discount_price = Number.isFinite(dbDiscount) && dbDiscount > 0 && dbDiscount < listPrice ? dbDiscount : null;
    const price = discount_price ?? listPrice;
    const qty = Math.min(99, Math.max(1, parseInt(it.qty, 10) || 1));
    const line = price * qty;
    subtotal += line;
    orderItems.push({
      product_id: p.product_id || productId,
      seller_id: p.seller_id,
      title: p.title || p.name || "",
      major_category: p.major_category || "",
      subcategory: p.subcategory || "",
      item_type: p.item_type || "",
      image_url: p.primary_image_url || p.image_url || (Array.isArray(p.images) && (p.images[0]?.url || p.images[0]?.image_url)) || "",
      price,
      discount_price,
      qty,
      subtotal: line,
    });
  }

  if (subtotal <= 0) throw new QuoteError(400, "Order total must be greater than zero");

  const total = subtotal + delivery.cost;
  return {
    buyer,
    items: orderItems,
    subtotal,
    shipping_total: delivery.cost,
    total_amount_pkr: total,
    charge_amount_minor: toMinor(total, "pkr"),
    delivery_method: delivery.method,
    shipping_address: {
      line1: shippingAddress.line1 || "",
      city: shippingAddress.city || "",
      province: shippingAddress.province || "",
      house_number: shippingAddress.house_number || "",
      phone: shippingPhone,
      notes: shippingAddress.notes || "",
    },
  };
}

module.exports = { quotePolarCart, QuoteError };
