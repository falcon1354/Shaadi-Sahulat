/**
 * Dispute routes — chat room + admin decision (Steps 7 & 8).
 *
 * Mounted at /api/disputes in server.js.
 *
 * Endpoints:
 *   GET  /?role=buyer|seller|admin&id=           list disputes for that party
 *   GET  /:dispute_id                            dispute detail with messages + evidence
 *   POST /:dispute_id/messages                   send chat message (Step 7)
 *   POST /:dispute_id/evidence                   upload evidence files (multipart)
 *   POST /:dispute_id/admin-decision             admin resolves/cancels (Step 8)
 */
const express = require("express");
const router = express.Router();

const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const Order = require("../models/Order");
const Package = require("../models/Package");
const SellerPayout = require("../models/SellerPayout");
const AdminWallet = require("../models/AdminWallet");

const { requireBuyer, requireSeller, requireAdmin } = require("../lib/auth");
const { generateTransactionId, generatePayoutId, computeSellerPayout } = require("../lib/helpers");
const { saveDisputeUpload, publicUrl, makeDisputeUploadMiddleware } = require("../lib/storage");
const { pushNotification, notifyAll } = require("../lib/notify");
const { emitDisputeMessage } = require("../lib/socket");

const disputeUpload = makeDisputeUploadMiddleware();

// ---------- list disputes ----------
router.get("/", async (req, res) => {
  try {
    const { role, id } = req.query;
    if (!role || !id) {
      return res.status(400).json({ success: false, error: "role and id query params required" });
    }
    const filter = {};
    if (role === "buyer") filter.buyer_id = id;
    else if (role === "seller") filter.seller_id = id;
    else if (role === "admin") {
      // admin sees all
    } else {
      return res.status(400).json({ success: false, error: "role must be buyer, seller, or admin" });
    }

    const disputes = await Dispute.find(filter).sort({ created_at: -1 }).lean();
    return res.json({ success: true, disputes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- dispute detail ----------
router.get("/:dispute_id", async (req, res) => {
  try {
    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id }).lean();
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });

    const messages = await DisputeMessage.find({ dispute_id: dispute.dispute_id })
      .sort({ created_at: 1 })
      .lean();

    return res.json({ success: true, dispute, messages });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- send chat message (Step 7) ----------
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

    if (dispute.status === "RESOLVED" || dispute.status === "CANCELLED") {
      return res.status(400).json({ success: false, error: `Dispute is ${dispute.status}. Chat is closed.` });
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
      dispute.status = "UNDER_REVIEW";
      await dispute.save();
    }

    // Real-time broadcast to everyone in this dispute room (buyer, seller, admin).
    // Falls back silently if socket.io is not initialised.
    emitDisputeMessage(dispute.dispute_id, msg.toObject());

    // Notify the OTHER parties about the new message
    const recipients = [
      { id: dispute.buyer_id, role: "buyer" },
      { id: dispute.seller_id, role: "seller" },
      { id: "admin", role: "admin" },
    ].filter(r => !(r.role === from_role && r.id === from_id));

    await Promise.all(
      recipients.map(r =>
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

// ---------- upload evidence (Step 6B / 6C) ----------
router.post("/:dispute_id/evidence", disputeUpload, async (req, res) => {
  try {
    const { from_id, from_role } = req.body || {};
    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: "No files uploaded" });

    const evidenceEntries = files.map(f => {
      const relPath = saveDisputeUpload(dispute.dispute_id, f.originalname, f.buffer);
      return {
        file_path: relPath,
        original_name: f.originalname,
        mime_type: f.mimetype,
        uploaded_by: from_role || "buyer",
        uploaded_at: new Date(),
      };
    });

    dispute.evidence.push(...evidenceEntries);
    await dispute.save();

    return res.status(201).json({
      success: true,
      message: `${files.length} file(s) uploaded as evidence.`,
      evidence: evidenceEntries.map(e => ({
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

// ---------- Step 8: admin decision (RESOLVED | CANCELLED) ----------
router.post("/:dispute_id/admin-decision", requireAdmin, async (req, res) => {
  try {
    const { decision, notes } = req.body || {};
    if (!["RESOLVED", "CANCELLED"].includes(decision)) {
      return res.status(400).json({ success: false, error: "decision must be RESOLVED or CANCELLED" });
    }

    const dispute = await Dispute.findOne({ dispute_id: req.params.dispute_id });
    if (!dispute) return res.status(404).json({ success: false, error: "Dispute not found" });
    if (dispute.status === "RESOLVED" || dispute.status === "CANCELLED") {
      return res.status(400).json({ success: false, error: `Dispute already ${dispute.status}` });
    }

    dispute.status = decision;
    dispute.admin_id = req.user.id;
    dispute.admin_notes = notes || "";
    dispute.decision = decision;
    dispute.decided_at = new Date();
    await dispute.save();

    const order = await Order.findOne({ order_id: dispute.order_id });
    if (!order) return res.status(404).json({ success: false, error: "Parent order not found" });

    if (decision === "RESOLVED") {
      // Original deal stands. Order → DELIVERED, ready for payment release (Step 10).
      order.status = "DELIVERED";
      order.timeline.push({
        status: "DELIVERED",
        at: new Date(),
        by: "admin",
        by_id: req.user.id,
        note: `Dispute ${dispute.dispute_id} RESOLVED. Original deal stands. Notes: ${notes || "N/A"}`,
      });
      await order.save();
      await Package.updateMany(
        { order_id: order.order_id, status: "DISPUTED" },
        { $set: { status: "DELIVERED" } }
      );
    } else {
      // CANCELLED — Step 9: order cancelled, seller gets nothing, bank notified
      order.status = "CANCELLED";
      order.payment_status = "CANCELLED";
      order.timeline.push({
        status: "CANCELLED",
        at: new Date(),
        by: "admin",
        by_id: req.user.id,
        note: `Dispute ${dispute.dispute_id} CANCELLED. Order cancelled. Seller gets nothing. Notes: ${notes || "N/A"}`,
      });
      await order.save();
      await Package.updateMany(
        { order_id: order.order_id },
        { $set: { status: "CANCELLED" } }
      );
    }

    await notifyAll({
      buyer_id: dispute.buyer_id,
      seller_id: dispute.seller_id,
      title: `Dispute ${decision}`,
      message: `Dispute ${dispute.dispute_id} for order ${dispute.order_id} has been ${decision} by admin. Notes: ${notes || "N/A"}`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });

    return res.json({
      success: true,
      message: `Dispute ${decision}. ${decision === "RESOLVED" ? "Order ready for payment release." : "Order cancelled."}`,
      dispute,
      order_status: order.status,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
