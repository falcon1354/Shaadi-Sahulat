/**
 * BNPL Countdown Timer — auto-transition expired BNPL applications.
 *
 * A setInterval (every 1 hour) that finds BnplApplication with status "APPROVED"
 * and offer_expires_at < Date.now(). For each expired application:
 *   1. Transition status to "OFFER_EXPIRED"
 *   2. Cancel associated order
 *   3. Notify buyer and admin
 *
 * Export startBnplTimer() and stopBnplTimer() so server.js can start/stop.
 */

const BnplApplication = require("../models/BnplApplication");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Order = require("../models/Order");
const { notifyBuyerAndAdmin } = require("../lib/notify");

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timerHandle = null;

async function processExpiredApplications() {
  try {
    const now = new Date();

    const expiredApps = await BnplApplication.find({
      status: "APPROVED",
      offer_expires_at: { $lt: now },
    }).lean();

    if (!expiredApps.length) {
      console.log("[bnplTimer] No expired applications found.");
      return;
    }

    console.log(`[bnplTimer] Found ${expiredApps.length} expired BNPL applications.`);

    for (const app of expiredApps) {
      // 1. Transition to OFFER_EXPIRED
      await BnplApplication.updateOne(
        { _id: app._id },
        { $set: { status: "OFFER_EXPIRED" } }
      );

      // Mark offer letter as EXPIRED
      await BnplOfferLetter.updateOne(
        { application_id: app.application_no },
        { $set: { status: "EXPIRED" } }
      );

      // 2. Cancel associated order
      await Order.updateOne(
        { order_id: app.order_id },
        {
          $set: { status: "CANCELLED", payment_status: "CANCELLED" },
          $push: {
            timeline: {
              status: "CANCELLED",
              at: new Date(),
              by: "system",
              by_id: "bnpl_timer",
              note: `BNPL offer for application ${app.application_no} expired (3-day window elapsed). Order auto-cancelled.`,
            },
          },
        }
      );

      // 3. Notify buyer and admin
      await notifyBuyerAndAdmin({
        buyer_id: app.buyer_id,
        title: "BNPL Offer Expired",
        message: `Your BNPL offer for application ${app.application_no} has expired. Order ${app.order_id} has been cancelled.`,
        type: "bnpl",
        ref_id: app.application_no,
      });

      console.log(`[bnplTimer] Application ${app.application_no} transitioned to OFFER_EXPIRED. Order ${app.order_id} cancelled.`);
    }
  } catch (err) {
    console.error("[bnplTimer] Error processing expired applications:", err.message);
  }
}

function startBnplTimer() {
  if (timerHandle) {
    console.log("[bnplTimer] Timer already running.");
    return;
  }
  // Run once immediately on start
  processExpiredApplications();
  timerHandle = setInterval(processExpiredApplications, INTERVAL_MS);
  console.log("[bnplTimer] Started — checking every 1 hour for expired BNPL applications.");
}

function stopBnplTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
    console.log("[bnplTimer] Stopped.");
  }
}

module.exports = { startBnplTimer, stopBnplTimer };
