/**
 * Notification routes — list + mark-read endpoints for buyer/seller/admin.
 *
 * Mounted at /api/notifications in server.js.
 *
 * All endpoints require a verified JWT; the recipient is the caller (req.user).
 *
 * Endpoints:
 *   GET  /?user_id=&role=                list notifications (newest first)
 *   POST /:id/read                       mark one as read
 *   POST /read-all?user_id=&role=&type=  mark all (optionally one type) as read
 */
const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { authenticate } = require("../lib/auth");
const { forbid } = require("../lib/authorize");

/**
 * Recipient filter for the verified caller. Admin notifications are sent to the
 * shared literal inbox "admin" (lib/notify.js), so admins match that or their own id.
 * Optional user_id / role query params must match the caller (they never grant access).
 */
function recipientFilter(req) {
  const { role, id } = req.user;
  const { user_id: qId, role: qRole } = req.query;
  if (qRole && qRole !== role) return null;
  if (role === "admin") {
    if (qId && qId !== id && qId !== "admin") return null;
    return { recipient_role: "admin", recipient_id: { $in: ["admin", id] } };
  }
  if (qId && qId !== id) return null;
  return { recipient_role: role, recipient_id: id };
}

router.get("/", authenticate, async (req, res) => {
  try {
    const filter = recipientFilter(req);
    if (!filter) return forbid(res);
    const notifications = await Notification.find(filter)
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    const unread = notifications.filter((n) => !n.read).length;
    const unread_by_type = {};
    for (const n of notifications) {
      if (n.read) continue;
      const t = n.type || "general";
      unread_by_type[t] = (unread_by_type[t] || 0) + 1;
    }
    return res.json({
      success: true,
      count: notifications.length,
      unread,
      unread_by_type,
      notifications,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:id/read", authenticate, async (req, res) => {
  try {
    const own = recipientFilter(req);
    if (!own) return forbid(res);
    const existing = await Notification.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ success: false, error: "Notification not found" });
    const ids = own.recipient_id.$in || [own.recipient_id];
    if (existing.recipient_role !== own.recipient_role || !ids.includes(existing.recipient_id)) return forbid(res);
    const updated = await Notification.findByIdAndUpdate(
      req.params.id,
      { $set: { read: true, read_at: new Date() } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, error: "Notification not found" });
    return res.json({ success: true, notification: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/read-all", authenticate, async (req, res) => {
  try {
    const { type, types } = req.query;
    const own = recipientFilter(req);
    if (!own) return forbid(res);
    const filter = { ...own, read: false };
    if (types) {
      const list = String(types)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (list.length) filter.type = { $in: list };
    } else if (type) {
      filter.type = String(type);
    }
    const result = await Notification.updateMany(filter, {
      $set: { read: true, read_at: new Date() },
    });
    return res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
