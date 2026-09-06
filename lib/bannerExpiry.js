/**
 * bannerExpiry.js — Banner Auto-Expiry Cron Job
 *
 * Runs every 10 minutes. Finds expired banners and:
 *   1. Deletes the image file from disk
 *   2. Removes the DB record
 *   3. Clears any related cache
 *
 * This replaces the need for manual cleanup.
 */

const fs = require("fs");
const Banner = require("../models/Banner");

let _interval = null;

function startBannerExpiry() {
  if (_interval) return; // already running

  // Run immediately on start
  cleanupExpired();

  // Then every 10 minutes
  _interval = setInterval(cleanupExpired, 10 * 60 * 1000);

  console.log("[BannerExpiry] Auto-expiry cron started (every 10 min).");
}

async function cleanupExpired() {
  try {
    const now = new Date();
    const expired = await Banner.find({ end_at: { $lt: now } });

    if (expired.length === 0) return;

    let filesRemoved = 0;
    let dbDeleted = 0;

    for (const banner of expired) {
      // Remove image file
      if (banner.image_path) {
        try {
          if (fs.existsSync(banner.image_path)) {
            fs.unlinkSync(banner.image_path);
            filesRemoved++;
          }
        } catch (e) {
          console.error(`[BannerExpiry] Failed to delete image: ${banner.image_path}`, e.message);
        }
      }

      // Remove DB record
      await Banner.deleteOne({ _id: banner._id });
      dbDeleted++;
    }

    console.log(`[BannerExpiry] Cleaned up ${dbDeleted} expired banner(s), ${filesRemoved} file(s) removed.`);
  } catch (err) {
    console.error("[BannerExpiry] Error:", err.message);
  }
}

function stopBannerExpiry() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    console.log("[BannerExpiry] Stopped.");
  }
}

module.exports = { startBannerExpiry, stopBannerExpiry, cleanupExpired };
