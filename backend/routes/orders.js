/**
 * Order Processing / Delivery / Completion module.
 *
 * Mounted at /api/orders in server.js.
 *
 * Implements BNPL&Delivery.md Module 2 Steps 1-11 (admin-in-loop on every
 * status transition):
 *
 *   Step 1  : Seller receives new-order notification (auto-fired on order create)
 *   Step 2  : Seller fetches customer location + calculates shipping
 *   Step 3  : Seller prepares + marks shipped (tracking #, courier)
 *   Step 4  : Buyer receives shipping notification (auto-fired on shipped)
 *   Step 5  : Seller marks delivered
 *   Step 6  : Buyer confirms receipt (RECEIVED | NOT_RECEIVED | PROBLEM)
 *   Step 7  : Real-time chat — handled by /api/disputes (Socket.io optional)
 *   Step 8  : Admin reviews dispute + makes decision — /api/disputes/:id/admin-decision
 *   Step 9  : Cancellation — fired by admin decision = CANCELLED
 *   Step 10 : Admin releases payment to seller — /api/admin/orders/:id/release-payment
 *   Step 11 : Order completion confirmation — fired automatically on payment release
 *
 * Endpoints:
 *   POST /                                create order from cart (buyer)
 *   GET  /?buyer_id=                      list buyer's orders
 *   GET  /?seller_id=                     list seller's packages (with order info)
 *   GET  /:order_id                       order detail with packages + timeline
 *   GET  /:order_id/packages              packages for an order
 *   POST /packages/:package_id/location   seller fetches customer location (Step 2)
 *   POST /packages/:package_id/shipping   seller confirms shipping method + tracking (Step 3)
 *   POST /packages/:package_id/preparing  seller marks "preparing" (Step 3 sub-step)
 *   POST /packages/:package_id/delivered  seller marks delivered (Step 5)
 *   POST /:order_id/buyer-confirm         buyer confirms receipt (Step 6)
 *   POST /:order_id/review                buyer submits review (Step 6 Option A)
 */
const express = require("express");
const router = express.Router();

const Buyer = require("../models/Buyer");
const Order = require("../models/Order");
const Package = require("../models/Package");
const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const Review = require("../models/Review");
const Notification = require("../models/Notification");

const { requireBuyer, requireSeller, requireAdmin, optionalBuyer } = require("../lib/auth");
const {
  generateOrderId,
  generatePackageId,
  generateDisputeId,
  generateReviewId,
  calculateShipping,
  computeSellerPayout,
  validatePhone,
  computeBankProcessingFee,
  validateTrackingNumber,
  formatTrackingNumber,
} = require("../lib/helpers");
const DowryEstimation = require("../models/DowryEstimation");
const { pushNotification, notifyBuyerAndAdmin, notifySellerAndAdmin, notifyAll } = require("../lib/notify");
const { saveDisputeUpload, publicUrl, makeDisputeUploadMiddleware } = require("../lib/storage");

const disputeUpload = makeDisputeUploadMiddleware();

// ---------- Step 1: create order from cart ----------
router.post("/", requireBuyer, async (req, res) => {
  try {
    const {
      items,
      shipping_address,
      payment_method, // "COD" | "BNPL"
      bnpl_application_id,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "items array is required" });
    }
    if (!shipping_address || !shipping_address.line1 || !shipping_address.city) {
      return res.status(400).json({ success: false, error: "shipping_address.line1 and .city are required" });
    }
    if (!["COD", "BNPL"].includes(payment_method)) {
      return res.status(400).json({ success: false, error: "payment_method must be COD or BNPL" });
    }

    const buyer = await Buyer.findOne({ buyer_id: req.user.id }).lean();
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });

    // Phone validation
    const shippingPhone = shipping_address.phone || buyer.phone || "";
    if (!validatePhone(shippingPhone.replace(/\D/g, ""))) {
      return res.status(400).json({ success: false, error: "Phone number must be 11 digits starting with 03" });
    }

    // Delivery method
    const delivery_method = req.body.delivery_method || "standard";

    // Validate items + compute subtotal
    let subtotal = 0;
    const orderItems = items.map(it => {
      const price = Number(it.discount_price != null ? it.discount_price : it.price) || 0;
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const sub = price * qty;
      subtotal += sub;
      return {
        product_id: it.product_id,
        seller_id: it.seller_id,
        title: it.title || "",
        major_category: it.major_category || "",
        subcategory: it.subcategory || "",
        item_type: it.item_type || "",
        image_url: it.image_url || "",
        price,
        discount_price: it.discount_price != null ? Number(it.discount_price) : null,
        qty,
        subtotal: sub,
      };
    });

    const orderId = generateOrderId();
    const initialStatus = payment_method === "BNPL" ? "PENDING_BNPL_APPROVAL" : "CONFIRMED";

    // Bank processing fee (BNPL)
    const bank_processing_fee = payment_method === "BNPL" ? computeBankProcessingFee(subtotal, 0.02) : 0;
    const totalWithFee = subtotal + bank_processing_fee;

    const order = await Order.create({
      order_id: orderId,
      buyer_id: req.user.id,
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone,
      items: orderItems,
      items_count: orderItems.reduce((n, i) => n + i.qty, 0),
      subtotal,
      shipping_total: 0, // set later by seller in Step 2
      total_amount: totalWithFee, // shipping + bank fee added when seller confirms
      bank_processing_fee,
      delivery_method,
      shipping_address: {
        line1: shipping_address.line1 || "",
        city: shipping_address.city || "",
        province: shipping_address.province || "",
        house_number: shipping_address.house_number || "",
        phone: shipping_address.phone || buyer.phone || "",
        notes: shipping_address.notes || "",
      },
      payment_method,
      payment_status: payment_method === "BNPL" ? "PENDING" : "UNPAID",
      status: initialStatus,
      bnpl_application_id: bnpl_application_id || "",
      primary_seller_id: orderItems[0].seller_id,
      timeline: [{
        status: initialStatus,
        at: new Date(),
        by: "buyer",
        by_id: req.user.id,
        note: `Order placed by buyer (${payment_method}). ${orderItems.length} item line(s), subtotal PKR ${subtotal.toLocaleString()}.`,
      }],
    });

    // Split into packages by seller_id
    const bySeller = new Map();
    for (const it of orderItems) {
      if (!bySeller.has(it.seller_id)) bySeller.set(it.seller_id, []);
      bySeller.get(it.seller_id).push(it);
    }

    const packages = [];

    // Deduct from dowry category budgets — if buyer has a DowryEstimation
    try {
      const estimation = await DowryEstimation.findOne({ user_id: req.user.id }).sort({ created_at: -1 });
      if (estimation && estimation.category_budgets) {
        for (const item of orderItems) {
          const cat = item.major_category || item.subcategory || "";
          if (cat && estimation.category_budgets[cat]) {
            estimation.category_budgets[cat].spent = (estimation.category_budgets[cat].spent || 0) + item.subtotal;
            estimation.category_budgets[cat].remaining = estimation.category_budgets[cat].estimated - estimation.category_budgets[cat].spent;
          }
        }
        await estimation.save();
      }
    } catch (deductErr) {
      console.warn("[orders] Dowry budget deduction failed:", deductErr.message);
    }

    // Increment buyer total_orders
    try {
      await Buyer.updateOne({ buyer_id: req.user.id }, { $inc: { total_orders: 1 } });
    } catch (incErr) {
      console.warn("[orders] Buyer total_orders increment failed:", incErr.message);
    }
    for (const [sellerId, sellerItems] of bySeller.entries()) {
      const pkgSubtotal = sellerItems.reduce((n, i) => n + i.subtotal, 0);
      const pkg = await Package.create({
        package_id: generatePackageId(),
        order_id: orderId,
        seller_id: sellerId,
        seller_name: sellerItems[0].seller_name || "",
        items: sellerItems.map(i => ({
          product_id: i.product_id,
          title: i.title,
          price: i.price,
          qty: i.qty,
          subtotal: i.subtotal,
        })),
        items_count: sellerItems.reduce((n, i) => n + i.qty, 0),
        subtotal: pkgSubtotal,
        shipping_method: "standard",
        shipping_cost: 0,
        distance_km: 0,
        status: "PENDING",
        admin_notified: true,
      });
      packages.push(pkg);

      // Step 1: notify seller + admin
      await notifySellerAndAdmin({
        seller_id: sellerId,
        title: "New Order Received",
        message: `You have received a new order ${orderId} (package ${pkg.package_id}). ${sellerItems.length} item(s), PKR ${pkgSubtotal.toLocaleString()}.`,
        type: "order",
        ref_id: orderId,
      });
    }

    return res.status(201).json({
      success: true,
      message: `Order ${orderId} created with ${packages.length} package(s).`,
      order: order.toObject(),
      packages: packages.map(p => ({
        package_id: p.package_id,
        seller_id: p.seller_id,
        subtotal: p.subtotal,
        status: p.status,
      })),
    });
  } catch (err) {
    console.error("[orders] create error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- list orders (buyer or seller) ----------
router.get("/", async (req, res) => {
  try {
    const { buyer_id, seller_id } = req.query;

    if (buyer_id) {
      const page  = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip  = (page - 1) * limit;

      const [orders, total_count] = await Promise.all([
        Order.find({ buyer_id }).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        Order.countDocuments({ buyer_id }),
      ]);
      const has_more = skip + orders.length < total_count;
      return res.json({ success: true, orders, total_count, page, has_more });
    }
    if (seller_id) {
      const packages = await Package.find({ seller_id }).sort({ created_at: -1 }).lean();
      const orderIds = [...new Set(packages.map(p => p.order_id))];
      const orders = await Order.find({ order_id: { $in: orderIds } }).lean();
      const orderMap = Object.fromEntries(orders.map(o => [o.order_id, o]));
      const enriched = packages.map(p => ({ ...p, order: orderMap[p.order_id] || null }));
      return res.json({ success: true, packages: enriched });
    }
    return res.status(400).json({ success: false, error: "Provide buyer_id or seller_id query param" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- single order ----------
router.get("/:order_id", async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.order_id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    const packages = await Package.find({ order_id: order.order_id }).lean();
    const disputes = await Dispute.find({ order_id: order.order_id }).lean();
    const reviews  = await Review.find({ order_id: order.order_id }).lean();

    // Build available_actions based on order state
    const available_actions = [];
    if (order.status === "DELIVERED" && !order.buyer_confirmed_receipt) {
      available_actions.push("confirm_reception");
    }
    if (order.buyer_confirmed_receipt && reviews.length === 0) {
      available_actions.push("review");
    }

    return res.json({ success: true, order, packages, disputes, available_actions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- packages for an order ----------
router.get("/:order_id/packages", async (req, res) => {
  try {
    const packages = await Package.find({ order_id: req.params.order_id }).lean();
    return res.json({ success: true, packages });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 2: seller fetches customer location + computes shipping ----------
router.post("/packages/:package_id/location", requireSeller, async (req, res) => {
  try {
    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    });
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found for this seller" });

    const order = await Order.findOne({ order_id: pkg.order_id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Parent order not found" });

    // Geocode placeholder: in production call Google Maps / OpenStreetMap.
    // For FYP we return the address + a deterministic distance based on city.
    const cityDistances = {
      Lahore: 5.0, Karachi: 12.5, Islamabad: 8.0, Rawalpindi: 7.8,
      Faisalabad: 6.2, Multan: 9.5, Peshawar: 11.0, Quetta: 14.5,
    };
    const distanceKm = cityDistances[order.shipping_address.city] || 5.0;

    const shippingOptions = ["standard", "express", "same_day"].map(m => {
      const calc = calculateShipping(distanceKm, m);
      return { method: m, cost: calc.total, eta_days: calc.eta_days };
    });

    return res.json({
      success: true,
      order_id: order.order_id,
      package_id: pkg.package_id,
      buyer_name: order.buyer_name,
      buyer_phone: order.buyer_phone,
      shipping_address: order.shipping_address,
      distance_km: distanceKm,
      shipping_options: shippingOptions,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 3 sub-step: seller marks "preparing" ----------
router.post("/packages/:package_id/preparing", requireSeller, async (req, res) => {
  try {
    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    });
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });
    if (!["PENDING"].includes(pkg.status)) {
      return res.status(400).json({ success: false, error: `Package is in status ${pkg.status}, cannot mark PREPARING` });
    }

    pkg.status = "PREPARING";
    await pkg.save();

    await Order.updateOne(
      { order_id: pkg.order_id },
      {
        $set: { status: "PREPARING" },
        $push: {
          timeline: {
            status: "PREPARING",
            at: new Date(),
            by: "seller",
            by_id: req.user.id,
            note: `Seller started preparing package ${pkg.package_id}.`,
          },
        },
      }
    );

    await notifyBuyerAndAdmin({
      buyer_id: (await Order.findOne({ order_id: pkg.order_id }).lean()).buyer_id,
      title: "Order is Being Prepared",
      message: `Seller has started preparing your package ${pkg.package_id} for order ${pkg.order_id}.`,
      type: "package",
      ref_id: pkg.package_id,
    });

    return res.json({ success: true, message: "Package marked as PREPARING.", package: pkg });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 3: seller confirms shipping (tracking + courier + method) ----------
router.post("/packages/:package_id/shipping", requireSeller, async (req, res) => {
  try {
    const { shipping_method, courier_company, tracking_number, distance_km, seller_note } = req.body || {};
    // Use defaults if fields are missing so seller doesn't get blocked
    const safeMethod  = shipping_method  || "standard";
    const safeCourier = courier_company  || "TCS";
    // Validate tracking_number format, auto-format if needed
    let safeTracking = tracking_number || `TRK-${Date.now()}`;
    if (safeTracking && !/^TRK-\d+$/.test(safeTracking)) {
      if (!validateTrackingNumber(safeTracking)) {
        return res.status(400).json({ success: false, error: "Tracking number must match format XXXX-XXXX-XXXX (12 alphanumeric chars with dashes)" });
      }
      safeTracking = formatTrackingNumber(safeTracking);
    }


    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    });
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });
    if (!["PENDING", "PREPARING"].includes(pkg.status)) {
      return res.status(400).json({ success: false, error: `Package is in status ${pkg.status}, cannot ship` });
    }

    const distance = Number(distance_km) || 5.0;
    const calc = calculateShipping(distance, safeMethod);

    pkg.status = "SHIPPED";
    pkg.shipping_method = safeMethod;
    pkg.shipping_cost = calc.total;
    pkg.distance_km = distance;
    pkg.courier_company = safeCourier;
    pkg.tracking_number = safeTracking;
    pkg.shipped_at = new Date();
    await pkg.save();

    // Update order total (add shipping) + timeline
    const order = await Order.findOne({ order_id: pkg.order_id });
    if (order) {
      order.shipping_total = (order.shipping_total || 0) + calc.total;
      order.total_amount = (order.subtotal || 0) + order.shipping_total;
      order.status = "SHIPPED";
      order.timeline.push({
        status: "SHIPPED",
        at: new Date(),
        by: "seller",
        by_id: req.user.id,
        note: `Package ${pkg.package_id} shipped via ${safeCourier} (tracking ${safeTracking}). Shipping cost PKR ${calc.total} (${safeMethod}, ETA ${calc.eta_days}).`,
      });
      await order.save();
    }

    // Step 4: notify buyer + admin
    await notifyBuyerAndAdmin({
      buyer_id: order ? order.buyer_id : "",
      title: "Your Order Has Been Shipped!",
      message: `Order ${pkg.order_id} package ${pkg.package_id} shipped via ${safeCourier}. Tracking #: ${safeTracking}. ETA: ${calc.eta_days}.`,
      type: "delivery",
      ref_id: pkg.package_id,
    });

    return res.json({
      success: true,
      message: "Package marked as SHIPPED. Buyer notified.",
      package: pkg,
      shipping_cost: calc.total,
      eta_days: calc.eta_days,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 5: seller marks delivered ----------
router.post("/packages/:package_id/delivered", requireSeller, async (req, res) => {
  try {
    const { delivery_note, recipient_name } = req.body || {};

    const pkg = await Package.findOne({
      package_id: req.params.package_id,
      seller_id: req.user.id,
    });
    if (!pkg) return res.status(404).json({ success: false, error: "Package not found" });
    if (pkg.status !== "SHIPPED") {
      return res.status(400).json({ success: false, error: `Package is in status ${pkg.status}, must be SHIPPED before delivery` });
    }

    pkg.status = "DELIVERED";
    pkg.delivered_at = new Date();
    pkg.delivery_note = delivery_note || "";
    pkg.recipient_name = recipient_name || "";
    await pkg.save();

    const order = await Order.findOne({ order_id: pkg.order_id });
    if (order) {
      order.status = "DELIVERED";
      order.timeline.push({
        status: "DELIVERED",
        at: new Date(),
        by: "seller",
        by_id: req.user.id,
        note: `Package ${pkg.package_id} delivered to ${recipient_name || "buyer"}. Note: ${delivery_note || "N/A"}`,
      });
      await order.save();
    }

    // Notify buyer + admin — buyer now needs to confirm receipt (Step 6)
    await notifyBuyerAndAdmin({
      buyer_id: order ? order.buyer_id : "",
      title: "Order Delivered — Please Confirm",
      message: `Your package ${pkg.package_id} for order ${pkg.order_id} has been delivered. Please confirm receipt in your Orders page.`,
      type: "delivery",
      ref_id: pkg.package_id,
    });

    return res.json({
      success: true,
      message: "Package marked as DELIVERED. Buyer has been asked to confirm receipt.",
      package: pkg,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 6: buyer confirms receipt (RECEIVED | NOT_RECEIVED | PROBLEM) ----------
router.post("/:order_id/buyer-confirm", requireBuyer, async (req, res) => {
  try {
    const { confirmation, problem_type, title, description, recommend } = req.body || {};
    if (!["RECEIVED", "NOT_RECEIVED", "PROBLEM"].includes(confirmation)) {
      return res.status(400).json({ success: false, error: "confirmation must be RECEIVED, NOT_RECEIVED, or PROBLEM" });
    }

    const order = await Order.findOne({ order_id: req.params.order_id, buyer_id: req.user.id });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    if (order.status !== "DELIVERED") {
      return res.status(400).json({ success: false, error: `Order is in status ${order.status}, must be DELIVERED before buyer confirmation` });
    }

    // Guard: if buyer already confirmed, reject duplicate
    if (order.buyer_confirmed_receipt) {
      return res.status(400).json({ success: false, error: "Already confirmed" });
    }

    if (confirmation === "RECEIVED") {
      // Step 6 Option A — set buyer_confirmed_receipt
      order.buyer_confirmed_receipt = true;
      order.buyer_confirmed_at = new Date();
      order.timeline.push({
        status: "DELIVERED",
        at: new Date(),
        by: "buyer",
        by_id: req.user.id,
        note: "Buyer confirmed receipt. Awaiting review (optional).",
      });
      await order.save();

      await notifySellerAndAdmin({
        seller_id: order.primary_seller_id,
        title: "Buyer Confirmed Receipt",
        message: `Buyer confirmed receipt of order ${order.order_id}. Awaiting review and admin payment release.`,
        type: "order",
        ref_id: order.order_id,
      });

      return res.json({
        success: true,
        message: "Receipt confirmed. You may now leave a review for the products.",
        next: "POST /api/orders/:order_id/review",
      });
    }

    // NOT_RECEIVED or PROBLEM → create dispute + Socket.io event
    order.buyer_confirmed_receipt = false; // explicit — they said NOT_RECEIVED/PROBLEM
    const disputeType = confirmation === "NOT_RECEIVED" ? "not_received" : (problem_type || "other");
    const allowedTypes = ["not_received", "damaged", "missing", "wrong", "poor_quality", "other"];
    if (!allowedTypes.includes(disputeType)) {
      return res.status(400).json({ success: false, error: `problem_type must be one of: ${allowedTypes.join(", ")}` });
    }

    const dispute = await Dispute.create({
      dispute_id: generateDisputeId(),
      order_id: order.order_id,
      package_id: "",
      buyer_id: req.user.id,
      seller_id: order.primary_seller_id,
      dispute_type: disputeType,
      title: title || (confirmation === "NOT_RECEIVED" ? "Order Not Received" : "Problem with Order"),
      description: description || "",
      evidence: [],
      status: "OPEN",
    });

    // Opening message from buyer in the chat room
    await DisputeMessage.create({
      dispute_id: dispute.dispute_id,
      order_id: order.order_id,
      sender_id: req.user.id,
      sender_role: "buyer",
      sender_name: order.buyer_name,
      message: description || title || "Buyer opened a dispute.",
    });

    order.status = "DISPUTED";
    order.timeline.push({
      status: "DISPUTED",
      at: new Date(),
      by: "buyer",
      by_id: req.user.id,
      note: `Dispute ${dispute.dispute_id} opened (${disputeType}). Title: ${title || "N/A"}`,
    });
    await order.save();

    // Mark all packages of this order as DISPUTED
    await Package.updateMany(
      { order_id: order.order_id, status: { $in: ["SHIPPED", "DELIVERED"] } },
      { $set: { status: "DISPUTED" } }
    );

    // Emit Socket.io dispute-opened event
    try {
      const { getIO } = require("../lib/socket");
      const io = getIO();
      if (io) {
        io.emit("order:dispute-opened", {
          order_id: order.order_id,
          dispute_id: dispute.dispute_id,
          buyer_id: req.user.id,
          seller_id: order.primary_seller_id,
          dispute_type: disputeType,
        });
      }
    } catch (socketErr) {
      console.warn("[orders] Socket.io dispute event emit failed:", socketErr.message);
    }

    // Step 7: notify all parties
    await notifyAll({
      buyer_id: req.user.id,
      seller_id: order.primary_seller_id,
      title: "Dispute Opened",
      message: `Dispute ${dispute.dispute_id} opened for order ${order.order_id}. Type: ${disputeType}. All parties can chat in the dispute room.`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });

    return res.status(201).json({
      success: true,
      message: "Dispute opened. All parties have been notified.",
      dispute,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 6 Option A: buyer submits review ----------
router.post("/:order_id/review", requireBuyer, async (req, res) => {
  try {
    const {
      rating, comment, title, recommend,
      ai_suggested_rating, ai_used, ai_generated, ai_provider,
    } = req.body || {};

    // Validate rating: must be 0.5–5 in 0.5 steps
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 0.5 || r > 5 || Math.abs(r * 2 - Math.round(r * 2)) > 1e-9) {
      return res.status(400).json({
        success: false,
        error: "rating must be 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, or 5",
      });
    }

    const order = await Order.findOne({ order_id: req.params.order_id, buyer_id: req.user.id });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    // Guard: check if review already exists for ALL products
    const existingReviews = await Review.find({
      order_id: order.order_id,
      buyer_id: req.user.id,
    });
    if (existingReviews.length >= order.items.length) {
      return res.status(400).json({ success: false, error: "All products in this order have already been reviewed" });
    }

    // Create one Review row per product in the order
    const reviews = [];
    for (const item of order.items) {
      const existing = await Review.findOne({
        product_id: item.product_id,
        order_id: order.order_id,
        buyer_id: req.user.id,
      });
      if (existing) continue; // one review per product per order

      const review = await Review.create({
        review_id: generateReviewId(),
        product_id: item.product_id,
        order_id: order.order_id,
        package_id: "",
        buyer_id: req.user.id,
        buyer_name: order.buyer_name,
        seller_id: item.seller_id,
        rating: r,
        title: (title || "").slice(0, 120),
        comment: comment || "",
        would_recommend: recommend !== false,
        visible: true,
        ai_suggested_rating: ai_suggested_rating != null ? Number(ai_suggested_rating) : null,
        ai_used: !!ai_used,
        ai_generated: !!ai_generated,
        ai_provider: ai_provider || "",
      });
      reviews.push(review);
    }

    order.timeline.push({
      status: order.status,
      at: new Date(),
      by: "buyer",
      by_id: req.user.id,
      note: `Buyer submitted ${reviews.length} review(s) with rating ${r}/5.${ai_generated ? " (AI-generated comment)" : ""}`,
    });
    await order.save();

    await notifySellerAndAdmin({
      seller_id: order.primary_seller_id,
      title: "New Review Received",
      message: `Buyer rated order ${order.order_id} ${r}/5 stars. Comment: ${comment || "(none)"}`,
      type: "review",
      ref_id: order.order_id,
      payload: { rating: r, product_ids: reviews.map(rv => rv.product_id) },
    });

    return res.status(201).json({
      success: true,
      message: `${reviews.length} review(s) submitted.`,
      reviews,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
