/**
 * Dispute / order confirmation deadline worker.
 * - Auto-complete DELIVERED orders after 7 days (unless disputed)
 * - Day-3 / day-6 reminders
 * - Auto-escalate disputes if seller misses 48h window
 * - Auto-refund if admin misses 5-day resolution SLA
 */
const Order = require("../models/Order");
const Dispute = require("../models/Dispute");
const Package = require("../models/Package");
const DisputeMessage = require("../models/DisputeMessage");
const { pushNotification, notifyAll, notifyBuyerAndAdmin, notifySellerAndAdmin } = require("./notify");
const {
  SLA,
  DAY,
  sellerResponseDeadline,
  adminResolutionDeadline,
  autoCompleteDeadline,
} = require("./disputeSla");

const INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
let _timer = null;

async function postSystemMessage(dispute, text) {
  await DisputeMessage.create({
    dispute_id: dispute.dispute_id,
    order_id: dispute.order_id,
    sender_id: "system",
    sender_role: "admin",
    sender_name: "System",
    message: text,
    is_system: true,
  });
}

async function processAutoComplete() {
  const now = new Date();
  const delivered = await Order.find({
    status: "DELIVERED",
    buyer_confirmed_receipt: { $ne: true },
    delivered_at: { $ne: null },
  }).limit(200);

  for (const order of delivered) {
    const openDispute = await Dispute.findOne({
      order_id: order.order_id,
      status: { $nin: ["RESOLVED", "CANCELLED"] },
    }).lean();
    if (openDispute) continue;

    const deadline = order.auto_complete_at || autoCompleteDeadline(order.delivered_at);
    const elapsedDays = (now - new Date(order.delivered_at)) / DAY;

    // Reminders
    if (elapsedDays >= SLA.BUYER_REMINDER_DAY && !order.auto_complete_reminder_day3) {
      order.auto_complete_reminder_day3 = true;
      await order.save();
      await pushNotification({
        recipient_id: order.buyer_id,
        recipient_role: "buyer",
        title: "Confirm your order",
        message: `Order ${order.order_id} auto-completes in ${Math.max(0, Math.ceil(SLA.BUYER_AUTO_COMPLETE_DAYS - elapsedDays))} day(s) if you take no action.`,
        type: "order",
        ref_id: order.order_id,
      });
    }
    if (elapsedDays >= SLA.BUYER_FINAL_WARNING_DAY && !order.auto_complete_reminder_day6) {
      order.auto_complete_reminder_day6 = true;
      await order.save();
      await pushNotification({
        recipient_id: order.buyer_id,
        recipient_role: "buyer",
        title: "Final warning — order auto-completes soon",
        message: `Order ${order.order_id} will auto-complete tomorrow if you don't confirm or open a dispute.`,
        type: "order",
        ref_id: order.order_id,
      });
    }

    if (now < new Date(deadline)) continue;

    order.status = "COMPLETED";
    order.buyer_confirmed_receipt = true;
    order.buyer_confirmed_at = now;
    order.payment_status = order.payment_status === "ON_HOLD" ? "RELEASED" : (order.payment_status || "PAID");
    if (["PAID", "PENDING"].includes(order.payment_status) || !order.payment_released_at) {
      order.payment_status = "RELEASED";
    }
    order.timeline.push({
      status: "COMPLETED",
      at: now,
      by: "system",
      note: `Auto-completed after ${SLA.BUYER_AUTO_COMPLETE_DAYS} days with no buyer action.`,
    });
    await order.save();
    await Package.updateMany(
      { order_id: order.order_id, status: { $in: ["DELIVERED", "SHIPPED"] } },
      { $set: { status: "COMPLETED" } }
    );
    await notifyBuyerAndAdmin({
      buyer_id: order.buyer_id,
      title: "Order auto-completed",
      message: `Order ${order.order_id} was auto-completed. Payment can be released to the seller.`,
      type: "order",
      ref_id: order.order_id,
    });
    await notifySellerAndAdmin({
      seller_id: order.primary_seller_id,
      title: "Order auto-completed",
      message: `Order ${order.order_id} auto-completed. Payment release pending admin.`,
      type: "order",
      ref_id: order.order_id,
    });
  }
}

async function processSellerTimeouts() {
  const now = new Date();
  const pending = await Dispute.find({
    status: { $in: ["SELLER_RESPONSE_PENDING", "OPEN"] },
    seller_response_deadline: { $lte: now },
    seller_responded_at: null,
  }).limit(100);

  for (const dispute of pending) {
    dispute.status = "ADMIN_REVIEW_PENDING";
    dispute.escalated_at = now;
    dispute.escalation_reason = "seller_non_responsive";
    dispute.admin_resolution_deadline = adminResolutionDeadline(now);
    dispute.seller_non_responsive = true;
    await dispute.save();
    await postSystemMessage(
      dispute,
      `Seller did not respond within ${SLA.SELLER_RESPONSE_HOURS} hours. Case auto-escalated to admin.`
    );
    await notifyAll({
      buyer_id: dispute.buyer_id,
      seller_id: dispute.seller_id,
      title: "Dispute escalated to admin",
      message: `Dispute ${dispute.dispute_id}: seller missed the ${SLA.SELLER_RESPONSE_HOURS}h response window.`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });
    await pushNotification({
      recipient_id: "admin",
      recipient_role: "admin",
      title: "Seller non-responsive — auto-escalation",
      message: `Dispute ${dispute.dispute_id} needs admin review (seller missed 48h).`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });
  }
}

async function processAdminTimeouts() {
  const now = new Date();
  const overdue = await Dispute.find({
    status: { $in: ["ADMIN_REVIEW_PENDING", "UNDER_REVIEW"] },
    admin_resolution_deadline: { $lte: now },
    decided_at: null,
  }).limit(50);

  for (const dispute of overdue) {
    dispute.status = "RESOLVED";
    dispute.decision = "buyer_wins_full";
    dispute.outcome_code = "CLOSED_BUYER_WINS_FULL_REFUND";
    dispute.admin_notes = `Auto-refund: admin missed ${SLA.ADMIN_RESOLUTION_DAYS}-day resolution SLA.`;
    dispute.decided_at = now;
    dispute.admin_id = "system";
    dispute.chat_locked = true;
    dispute.appeal_deadline = new Date(now.getTime() + SLA.APPEAL_WINDOW_DAYS * DAY);
    await dispute.save();

    const order = await Order.findOne({ order_id: dispute.order_id });
    if (order) {
      order.status = "CANCELLED";
      order.payment_status = "REFUNDED";
      order.timeline.push({
        status: "CANCELLED",
        at: now,
        by: "system",
        note: `Auto-refunded buyer — admin missed ${SLA.ADMIN_RESOLUTION_DAYS}-day dispute SLA (${dispute.dispute_id}).`,
      });
      await order.save();
      await Package.updateMany({ order_id: order.order_id }, { $set: { status: "CANCELLED" } });
    }
    await postSystemMessage(dispute, `Admin resolution SLA missed. Buyer auto-refunded.`);
    await notifyAll({
      buyer_id: dispute.buyer_id,
      seller_id: dispute.seller_id,
      title: "Dispute auto-resolved (buyer refund)",
      message: `Dispute ${dispute.dispute_id} auto-refunded buyer after admin SLA timeout.`,
      type: "dispute",
      ref_id: dispute.dispute_id,
    });
  }
}

async function tick() {
  try {
    await processAutoComplete();
    await processSellerTimeouts();
    await processAdminTimeouts();
  } catch (err) {
    console.error("[disputeTimer]", err.message);
  }
}

function startDisputeTimer() {
  if (_timer) return;
  tick();
  _timer = setInterval(tick, INTERVAL_MS);
  console.log(`[disputeTimer] Started — checking every ${INTERVAL_MS / 60000} min (7d auto-complete, 48h seller, 5d admin)`);
}

module.exports = { startDisputeTimer, tick };
