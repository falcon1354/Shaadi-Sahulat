/**
 * Notification helper — wraps the Notification model so every status
 * transition across the BNPL + Order modules can fire a notification
 * in a single line. The admin is always CC'd (per spec: "keep the
 * Admin in Loop Too, in Order, and Delivery").
 *
 * Each push also emits a real-time Socket.io event to the recipient's
 * room (role:id) so the frontend NotificationBell updates instantly
 * without polling.  If the recipient is offline, the persisted row in
 * the notifications collection will be picked up next time they fetch
 * /api/notifications.
 */
const Notification = require("../models/Notification");
const { generateNotificationId } = require("./helpers");
const { emitToUser } = require("./socket");

/**
 * Push a notification to one recipient.
 * @param {object} args
 * @param {string} args.recipient_id   buyer_id / seller_id / "admin"
 * @param {string} args.recipient_role "buyer" | "seller" | "admin" | "bank_officer"
 * @param {string} args.title
 * @param {string} args.message
 * @param {string} args.type           "order"|"package"|"delivery"|"bnpl"|"dispute"|"payout"|"review"|"system"
 * @param {string} [args.ref_id]
 * @param {object} [args.payload]      optional extra data sent over socket
 */
async function pushNotification({ recipient_id, recipient_role, title, message, type = "system", ref_id = "", payload = {} }) {
  try {
    const doc = await Notification.create({
      notification_id: generateNotificationId(),
      recipient_id,
      recipient_role,
      title: title || "",
      message: message || "",
      type,
      ref_id,
      read: false,
      read_at: null,
    });

    // Real-time push (best-effort; safe if socket not initialised)
    if (["buyer", "seller", "admin"].includes(recipient_role)) {
      emitToUser(recipient_role, recipient_id, "notification:new", {
        notification_id: doc.notification_id,
        recipient_id,
        recipient_role,
        title,
        message,
        type,
        ref_id,
        payload,
        created_at: doc.created_at,
        read: false,
      });
    }
  } catch (err) {
    console.error("[notify] failed to push notification:", err.message);
  }
}

/** Convenience: notify buyer + admin in one call. */
async function notifyBuyerAndAdmin({ buyer_id, title, message, type, ref_id, payload }) {
  await Promise.all([
    pushNotification({ recipient_id: buyer_id, recipient_role: "buyer", title, message, type, ref_id, payload }),
    pushNotification({ recipient_id: "admin", recipient_role: "admin", title: `[Buyer] ${title}`, message, type, ref_id, payload }),
  ]);
}

/** Convenience: notify seller + admin in one call. */
async function notifySellerAndAdmin({ seller_id, title, message, type, ref_id, payload }) {
  await Promise.all([
    pushNotification({ recipient_id: seller_id, recipient_role: "seller", title, message, type, ref_id, payload }),
    pushNotification({ recipient_id: "admin", recipient_role: "admin", title: `[Seller] ${title}`, message, type, ref_id, payload }),
  ]);
}

/** Convenience: notify buyer, seller, and admin simultaneously (e.g. dispute opened). */
async function notifyAll({ buyer_id, seller_id, title, message, type, ref_id, payload }) {
  await Promise.all([
    pushNotification({ recipient_id: buyer_id, recipient_role: "buyer", title, message, type, ref_id, payload }),
    pushNotification({ recipient_id: seller_id, recipient_role: "seller", title, message, type, ref_id, payload }),
    pushNotification({ recipient_id: "admin", recipient_role: "admin", title: `[Dispute] ${title}`, message, type, ref_id, payload }),
  ]);
}

module.exports = { pushNotification, notifyBuyerAndAdmin, notifySellerAndAdmin, notifyAll };
