/**
 * Dispute routes — chat, seller 48h response, admin resolution, SLA snapshots.
 * Mounted at /api/disputes
 */
const express = require("express");
const router = express.Router();

const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const Order = require("../models/Order");
const Package = require("../models/Package");

const { requireAdmin } = require("../lib/auth");
const { saveDisputeUploadAsync, publicUrl, makeDisputeUploadMiddleware } = require("../lib/storage");
const { pushNotification, notifyAll } = require("../lib/notify");
const { emitDisputeMessage } = require("../lib/socket");
const {
  buildSlaSnapshot,
  SELLER_ACTIONS,
  ADMIN_OUTCOMES,
  adminResolutionDeadline,
  appealDeadline,
  SLA,
  DISPUTE_CATEGORIES,
} = require("../lib/disputeSla");

const disputeUpload = makeDisputeUploadMiddleware();

async function postSystem(dispute, text) {
  const msg = await DisputeMessage.create({
    dispute_id: dispute.dispute_id,
    order_id: dispute.order_id,
    sender_id: "system",
    sender_role: "admin",
    sender_name: "System",
    is_system: true,
    message: text,
  });
  emitDisputeMessage(dispute.dispute_id, msg.toObject());
  return msg;
}

router.get("/meta/sla", (_req, res) => {
  return res.json({
    success: true,
    sla: SLA,
    categories: DISPUTE_CATEGORIES.filter((c) => c.id !== "poor_quality"),
    seller_actions: SELLER_ACTIONS,
    admin_outcomes: ADMIN_OUTCOMES,
  });
});

router.get("/", async (req, res) => {
  try {
    const { role, id, filter } = req.query;
    if (!role || !id) {
      return res.status(400).json({ success: false, error: "role and id query params required" });
    }
    const q = {};
    if (role === "buyer") q.buyer_id = id;
    else if (role === "seller") q.seller_id = id;
    else if (role === "admin") {
      if (filter === "open") q.status = { $nin: ["RESOLVED", "CANCELLED"] };
      if (filter === "overdue") {
        q.status = { $in: ["ADMIN_REVIEW_PENDING", "UNDER_REVIEW", "SELLER_RESPONSE_PENDING"] };
        q.$or = [
          { seller_response_deadline: { $lte: new Date() } },
          { admin_resolution_deadline: { $lte: new Date() } },
        ];
      }
    } else {
      return res.status(400).json({ success: false, error: "role must be buyer, seller, or admin" });
    }

    const disputes = await Dispute.find(q).sort({ created_at: -1 }).lean();
    const enriched = disputes.map((d) => ({
      ...d,
      sla: buildSlaSnapshot(d),
    }));
    return res.json({ success: true, disputes: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:dispute_id", async (req, res) => {
  try {
    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id }).lean();
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });

    const messages = await DisputeMessage.find({ dispute_id: dispute.dispute_id })
      .sort({ created_at: 1 })
      .lean();
    const order = await Order.findOne({ order_id: dispute.order_id }).lean();

    return res.json({
      success: true,
      dispute,
      messages,
      order: order
        ? {
            order_id: order.order_id,
            status: order.status,
            payment_status: order.payment_status,
            total_amount: order.total_amount,
            delivered_at: order.delivered_at,
            items: order.items,
          }
        : null,
      sla: buildSlaSnapshot(dispute, order || {}),
      seller_actions: SELLER_ACTIONS,
      admin_outcomes: ADMIN_OUTCOMES,
      categories: DISPUTE_CATEGORIES,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:dispute_id/messages", async (req, res) => {
  try {
    const { from_role, from_id, from_name, message } = req.body || {};
    if (!from_role || !from_id || !message) {
      return res.status(400).json({ success: false, error: "from_role, from_id, and message are required" });
    }
    if (!["buyer", "seller", "admin"].includes(from_role)) {
      return res.status(400).json({ success: false, error: "from_role must be buyer, seller, or admin" });
    }

    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });

    if (dispute.chat_locked || ["RESOLVED", "CANCELLED"].includes(dispute.status)) {
      return res.status(400).json({ success: false, error: `Dispute is ${dispute.status}. Chat is closed.` });
    }
    if ((dispute.muted_roles || []).includes(from_role)) {
      return res.status(403).json({ success: false, error: "You are muted in this dispute (read-only)." });
    }

    const msg = await DisputeMessage.create({
      dispute_id: dispute.dispute_id,
      order_id: dispute.order_id,
      sender_id: from_id,
      sender_role: from_role,
      sender_name: from_name || "",
      message,
    });

    if (dispute.status === "OPEN") {
      dispute.status = "SELLER_RESPONSE_PENDING";
      await dispute.save();
    }

    emitDisputeMessage(dispute.dispute_id, msg.toObject());

    const recipients = [
      { id: dispute.buyer_id, role: "buyer" },
      { id: dispute.seller_id, role: "seller" },
      { id: "admin", role: "admin" },
    ].filter((r) => !(r.role === from_role && r.id === from_id));

    await Promise.all(
      recipients.map((r) =>
        pushNotification({
          recipient_id: r.id,
          recipient_role: r.role,
          title: `New message in dispute ${dispute.dispute_id}`,
          message: `${from_name || from_role}: ${message.slice(0, 120)}${message.length > 120 ? "…" : ""}`,
          type: "dispute",
          ref_id: dispute.dispute_id,
        })
      )
    );

    return res.status(201).json({ success: true, message: "Message sent.", msg });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:dispute_id/evidence", disputeUpload, async (req, res) => {
  try {
    const { from_id, from_role, description } = req.body || {};
    if (from_role !== "buyer") {
      return res.status(403).json({
        success: false,
        error: "Only the buyer can upload dispute evidence.",
      });
    }

    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });

    if (from_id && dispute.buyer_id !== from_id) {
      return res.status(403).json({ success: false, error: "Only the dispute buyer can upload evidence." });
    }

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: "No files uploaded" });
    if (files.length > 5) return res.status(400).json({ success: false, error: "Max 5 files per upload" });

    const partyCount = (dispute.evidence || []).filter((e) => e.uploaded_by === "buyer").length;
    if (partyCount + files.length > 10) {
      return res.status(400).json({ success: false, error: "Max 10 evidence files per party" });
    }

    const evidenceEntries = [];
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "Max 10MB per file" });
      }
      const relPath = await saveDisputeUploadAsync(dispute.dispute_id, f.originalname, f.buffer);
      evidenceEntries.push({
        file_path: relPath,
        original_name: f.originalname,
        mime_type: f.mimetype,
        uploaded_by: "buyer",
        uploaded_at: new Date(),
        description: description || "",
      });
    }

    dispute.evidence.push(...evidenceEntries);
    await dispute.save();
    await postSystem(dispute, `Buyer uploaded ${evidenceEntries.length} evidence file(s).`);

    return res.status(201).json({
      success: true,
      message: `${files.length} file(s) uploaded as evidence.`,
      evidence: evidenceEntries.map((e) => ({
        file_path: e.file_path,
        original_name: e.original_name,
        url: publicUrl(e.file_path),
        uploaded_by: e.uploaded_by,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * DELEGATE PATTERN (University demo) — Seller dispute responses
 * ============================================================================
 * In C#, a "delegate" is a type-safe pointer to a method: you store a function
 * in a variable and call it later, without hard-coding which method runs.
 *
 * JavaScript has no `delegate` keyword, but the same idea is a FUNCTION REFERENCE
 * (callback). Below, each seller action is a separate async function. We store
 * those functions in a map (`sellerResponseDelegates`). At runtime we look up
 * the function by action name and invoke it — that lookup+call is the delegate use.
 *
 * Benefit vs if/else: the route only says "run the handler for this action".
 * Adding a new seller option = add one function to the map, not grow a long chain.
 * ============================================================================
 */

/**
 * Shared context passed into every seller-response delegate.
 * @typedef {object} SellerRespondCtx
 * @property {object} dispute  Mongoose dispute document
 * @property {object|null} order  Parent order (may be null)
 * @property {Date} now
 * @property {string} note
 * @property {string} [tracking_number]
 */

/** Delegate: seller accepts full refund → close dispute, refund buyer. */
async function handleAcceptFullRefund(ctx) {
  const { dispute, order, now } = ctx;
  dispute.status = "RESOLVED";
  dispute.decision = "accept_full_refund";
  dispute.outcome_code = "CLOSED_BUYER_WINS_FULL_REFUND";
  dispute.decided_at = now;
  dispute.chat_locked = true;
  dispute.appeal_deadline = appealDeadline(now);
  await dispute.save();
  if (order) {
    order.status = "CANCELLED";
    order.payment_status = "REFUNDED";
    order.timeline.push({
      status: "CANCELLED",
      at: now,
      by: "seller",
      note: `Seller accepted full refund on dispute ${dispute.dispute_id}.`,
    });
    await order.save();
    await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
  }
  await postSystem(dispute, "Seller accepted a full refund. Order closed as refunded.");
}

/** Delegate: seller offers partial refund → wait for buyer accept/reject. */
async function handleOfferPartialRefund(ctx) {
  const { dispute } = ctx;
  dispute.status = "BUYER_REVIEW_PENDING";
  await dispute.save();
  await postSystem(
    dispute,
    `Seller offered a partial refund (${dispute.seller_offer_percent || "?"}%). Buyer can accept or reject.`
  );
}

/** Delegate: seller offers replacement → wait for buyer accept/reject. */
async function handleOfferReplacement(ctx) {
  const { dispute, tracking_number } = ctx;
  dispute.status = "BUYER_REVIEW_PENDING";
  await dispute.save();
  await postSystem(
    dispute,
    `Seller offered a replacement (tracking: ${tracking_number || "pending"}). Buyer can accept or reject.`
  );
}

/** Delegate: seller rejects dispute → escalate to admin (5-day SLA starts). */
async function handleRejectDispute(ctx) {
  const { dispute, now, note } = ctx;
  dispute.status = "ADMIN_REVIEW_PENDING";
  dispute.escalated_at = now;
  dispute.escalation_reason = "seller_rejected";
  dispute.admin_resolution_deadline = adminResolutionDeadline(now);
  await dispute.save();
  await postSystem(
    dispute,
    `Seller rejected the dispute${note ? `: ${note}` : ""}. Escalated to admin.`
  );
}

/**
 * Delegate map: action id → handler function.
 * Each value is a delegate (function reference). We do NOT call them here —
 * we only register them. Invocation happens later via sellerResponseDelegates[action](...).
 */
const sellerResponseDelegates = {
  accept_full_refund: handleAcceptFullRefund,
  offer_partial_refund: handleOfferPartialRefund,
  offer_replacement: handleOfferReplacement,
  reject_dispute: handleRejectDispute,
};

/** Seller pre-arbitration response (48h window) — uses delegate map above. */
router.post("/:dispute_id/seller-respond", async (req, res) => {
  try {
    const { seller_id, action, note, refund_percent, tracking_number } = req.body || {};
    const allowed = SELLER_ACTIONS.map((a) => a.id);
    if (!allowed.includes(action)) {
      return res.status(400).json({ success: false, error: `action must be one of: ${allowed.join(", ")}` });
    }

    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });
    if (seller_id && dispute.seller_id !== seller_id) {
      return res.status(403).json({ success: false, error: "Not your dispute" });
    }
    if (!["SELLER_RESPONSE_PENDING", "OPEN"].includes(dispute.status)) {
      return res.status(400).json({ success: false, error: `Cannot respond in status ${dispute.status}` });
    }

    const now = new Date();
    dispute.seller_responded_at = now;
    dispute.seller_response_action = action;
    dispute.seller_response_note = note || "";
    if (refund_percent != null) dispute.seller_offer_percent = Number(refund_percent);
    if (tracking_number) dispute.seller_replacement_tracking = tracking_number;

    const order = await Order.findOne({ order_id: dispute.order_id });

    // --- DELEGATE INVOCATION ---
    // 1) Look up the function reference for this action (the "delegate").
    // 2) Call it. The route does not use if/else for business outcomes.
    const handler = sellerResponseDelegates[action]; // delegate = function pointer
    if (!handler) {
      return res.status(400).json({ success: false, error: `No delegate registered for action: ${action}` });
    }
    await handler({
      dispute,
      order,
      now,
      note: note || "",
      tracking_number: tracking_number || "",
    });

    await notifyAll({
      buyer_id: dispute.buyer_id,
      seller_id: dispute.seller_id,
      title: "Seller responded to dispute",
      message: `Dispute ${dispute.dispute_id}: seller chose ${action}.`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });

    return res.json({ success: true, dispute, sla: buildSlaSnapshot(dispute.toObject(), order || {}) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/** Buyer accepts/rejects seller offer. */
router.post("/:dispute_id/buyer-review", async (req, res) => {
  try {
    const { buyer_id, accept } = req.body || {};
    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });
    if (buyer_id && dispute.buyer_id !== buyer_id) {
      return res.status(403).json({ success: false, error: "Not your dispute" });
    }
    if (dispute.status !== "BUYER_REVIEW_PENDING") {
      return res.status(400).json({ success: false, error: "No seller offer pending" });
    }

    const now = new Date();
    const order = await Order.findOne({ order_id: dispute.order_id });

    if (accept) {
      dispute.status = "RESOLVED";
      dispute.decision = dispute.seller_response_action;
      dispute.outcome_code =
        dispute.seller_response_action === "offer_replacement"
          ? "CLOSED_REPLACEMENT"
          : "CLOSED_BUYER_WINS_PARTIAL_REFUND";
      dispute.decided_at = now;
      dispute.chat_locked = true;
      dispute.appeal_deadline = appealDeadline(now);
      await dispute.save();
      if (order) {
        if (dispute.seller_response_action === "offer_replacement") {
          order.status = "CONFIRMED";
          order.payment_status = "ON_HOLD";
        } else {
          order.status = "CANCELLED";
          order.payment_status = "PARTIAL_RELEASED";
        }
        order.timeline.push({
          status: order.status,
          at: now,
          by: "buyer",
          note: `Buyer accepted seller offer (${dispute.seller_response_action}).`,
        });
        await order.save();
      }
      await postSystem(dispute, "Buyer accepted the seller's offer. Dispute resolved.");
    } else {
      dispute.status = "ADMIN_REVIEW_PENDING";
      dispute.escalated_at = now;
      dispute.escalation_reason = "buyer_rejected_offer";
      dispute.admin_resolution_deadline = adminResolutionDeadline(now);
      await dispute.save();
      await postSystem(dispute, "Buyer rejected the seller's offer. Escalated to admin.");
    }

    return res.json({ success: true, dispute });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:dispute_id/admin-decision", requireAdmin, async (req, res) => {
  try {
    const { decision, notes, refund_percent } = req.body || {};
    const outcome = ADMIN_OUTCOMES.find((o) => o.id === decision);
    // Support legacy RESOLVED / CANCELLED
    const legacyMap = {
      RESOLVED: "seller_wins",
      CANCELLED: "buyer_wins_full",
    };
    const outcomeId = outcome ? decision : legacyMap[decision];
    const resolvedOutcome = ADMIN_OUTCOMES.find((o) => o.id === outcomeId);
    if (!resolvedOutcome) {
      return res.status(400).json({
        success: false,
        error: `decision must be one of: ${ADMIN_OUTCOMES.map((o) => o.id).join(", ")}`,
      });
    }

    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });
    if (["RESOLVED", "CANCELLED"].includes(dispute.status) && dispute.decided_at) {
      return res.status(400).json({ success: false, error: `Dispute already ${dispute.status}` });
    }

    const now = new Date();
    dispute.status = "RESOLVED";
    dispute.admin_id = req.user.id;
    dispute.admin_notes = notes || "";
    dispute.decision = resolvedOutcome.id;
    dispute.outcome_code = resolvedOutcome.closesAs;
    dispute.refund_percent = refund_percent != null ? Number(refund_percent) : null;
    dispute.decided_at = now;
    dispute.chat_locked = true;
    dispute.appeal_deadline = appealDeadline(now);
    await dispute.save();

    const order = await Order.findOne({ order_id: dispute.order_id });
    if (!order) return res.status(404).json({ success: false, error: "Parent order not found" });

    if (resolvedOutcome.id === "seller_wins") {
      order.status = "COMPLETED";
      order.payment_status = "RELEASED";
      order.buyer_confirmed_receipt = true;
      await Package.updateMany(
        { order_id: order.order_id, status: "DISPUTED" },
        { $set: { status: "COMPLETED" } }
      );
    } else if (resolvedOutcome.id === "force_replacement") {
      order.status = "CONFIRMED";
      order.payment_status = "ON_HOLD";
      await Package.updateMany({ order_id: order.order_id }, { $set: { status: "PENDING" } });
    } else if (resolvedOutcome.id === "buyer_wins_return") {
      order.status = "DISPUTED";
      order.payment_status = "ON_HOLD";
    } else if (resolvedOutcome.id === "compromise" || resolvedOutcome.id === "buyer_wins_partial") {
      order.status = "CANCELLED";
      order.payment_status = "PARTIAL_RELEASED";
      await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
    } else {
      // buyer_wins_full
      order.status = "CANCELLED";
      order.payment_status = "REFUNDED";
      await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
    }

    order.timeline.push({
      status: order.status,
      at: now,
      by: "admin",
      by_id: req.user.id,
      note: `Dispute ${dispute.dispute_id} resolved as ${resolvedOutcome.closesAs}. Notes: ${notes || "N/A"}`,
    });
    await order.save();

    await postSystem(dispute, `Admin resolved dispute: ${resolvedOutcome.label}. Chat locked. Appeal window: ${SLA.APPEAL_WINDOW_DAYS} days.`);

    await notifyAll({
      buyer_id: dispute.buyer_id,
      seller_id: dispute.seller_id,
      title: "Dispute resolved",
      message: `Dispute ${dispute.dispute_id}: ${resolvedOutcome.label}. ${notes || ""}`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });

    return res.json({
      success: true,
      message: `Dispute resolved: ${resolvedOutcome.label}`,
      dispute,
      order_status: order.status,
      payment_status: order.payment_status,
      appeal_deadline: dispute.appeal_deadline,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
