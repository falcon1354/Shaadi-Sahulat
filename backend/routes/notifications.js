/**
 * Notification routes — list + mark-read endpoints for buyer/seller/admin.
 *
 * Mounted at /api/notifications in server.js.
 *
 * Endpoints:
 *   GET  /?user_id=&role=                list notifications (newest first)
 *   POST /:id/read                       mark one as read
 *   POST /read-all?user_id=&role=        mark all as read
 */
const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

router.get("/", async (req, res) => {
  try {
    const { user_id, role } = req.query;
    if (!user_id || !role) {
      return res.status(400).json({ success: false, error: "user_id and role are required" });
    }
    const notifications = await Notification.find({
      recipient_id: user_id,
      recipient_role: role,
    })
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    const unread = notifications.filter(n => !n.read).length;
    return res.json({ success: true, count: notifications.length, unread, notifications });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:id/read", async (req, res) => {
  try {
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

router.post("/read-all", async (req, res) => {
  try {
    const { user_id, role } = req.query;
    if (!user_id || !role) {
      return res.status(400).json({ success: false, error: "user_id and role are required" });
    }
    const result = await Notification.updateMany(
      { recipient_id: user_id, recipient_role: role, read: false },
      { $set: { read: true, read_at: new Date() } }
    );
    return res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
