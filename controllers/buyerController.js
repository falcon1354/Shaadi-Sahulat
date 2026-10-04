const Buyer  = require("../models/Buyer");

// Registration / login live in controllers/authController.js (POST /api/auth/*).
// The legacy /api/buyer/register + /login handlers were removed in Phase 2I.

async function getBuyerProfile(req, res) {
  try {
    const buyer = await Buyer.findOne({ buyer_id: req.params.buyer_id }).lean();
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });
    delete buyer.password_hash;
    return res.json({ success: true, buyer });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Toggle wishlist item — add if not present, remove if present
async function toggleWishlist(req, res) {
  try {
    const { buyer_id } = req.params;
    const { product_id, title = "", price = 0, major_category = "" } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: "product_id required" });

    const buyer = await Buyer.findOne({ buyer_id });
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });

    const idx = buyer.wishlist_items.findIndex(w => w.product_id === product_id);
    let action;
    if (idx >= 0) {
      buyer.wishlist_items.splice(idx, 1);
      action = "removed";
    } else {
      buyer.wishlist_items.unshift({ product_id, title, price, major_category, added_at: new Date() });
      action = "added";
    }

    await buyer.save();
    return res.json({ success: true, action, wishlist_items: buyer.wishlist_items });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Add/update recently viewed — upsert to front, keep last 10
async function addRecentlyViewed(req, res) {
  try {
    const { buyer_id } = req.params;
    const { product_id, title = "", price = 0, major_category = "" } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: "product_id required" });

    const buyer = await Buyer.findOne({ buyer_id });
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });

    // Remove existing entry for this product, push to front
    buyer.recently_viewed_items = buyer.recently_viewed_items.filter(v => v.product_id !== product_id);
    buyer.recently_viewed_items.unshift({ product_id, title, price, major_category, viewed_at: new Date() });
    buyer.recently_viewed_items = buyer.recently_viewed_items.slice(0, 10);

    await buyer.save();
    return res.json({ success: true, recently_viewed_items: buyer.recently_viewed_items });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Sync full cart — replaces buyer's stored cart_items with client cart
// For each item, validate qty against stock (cap at stock_quantity). If stock is 0, remove item.
async function syncCart(req, res) {
  try {
    const { buyer_id } = req.params;
    const { cart_items } = req.body;
    if (!Array.isArray(cart_items)) return res.status(400).json({ success: false, error: "cart_items must be an array" });

    // Validate stock quantities — cap qty at stock_quantity, remove items with stock 0
    const Product = require("../models/Product");
    const validatedItems = [];
    for (const item of cart_items) {
      const product = await Product.findOne({ product_id: item.product_id }).lean();
      if (!product) {
        // Product no longer exists — skip
        continue;
      }
      const stock = product.stock_quantity || 0;
      if (stock <= 0) {
        // Stock depleted — remove item
        continue;
      }
      // Cap qty at available stock
      const cappedQty = Math.min(Math.max(1, parseInt(item.qty, 10) || 1), stock);
      validatedItems.push({
        ...item,
        qty: cappedQty,
        stock_quantity: stock,
        seller_id: product.seller_id || "",
      });
    }

    const buyer = await Buyer.findOneAndUpdate(
      { buyer_id },
      { $set: { cart_items: validatedItems } },
      { new: true }
    );
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });
    return res.json({ success: true, cart_items: buyer.cart_items });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Full buyer data — profile + latest dowry + cart (for admin view and seeding)
async function getFullBuyerData(req, res) {
  try {
    const { buyer_id } = req.params;
    const buyer = await Buyer.findOne({ buyer_id }).lean();
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });
    delete buyer.password_hash;

    const DowryEstimation = require("../models/DowryEstimation");
    let estimation = await DowryEstimation.findOne({ user_id: buyer_id }).sort({ created_at: -1 }).lean();

    // Fallback for old estimations saved with wrong/anonymous user_id:
    // if Buyer doc has dowry_estimation_id, fetch directly and fix the stale user_id.
    if (!estimation && buyer.dowry_estimation_id) {
      try {
        estimation = await DowryEstimation.findById(buyer.dowry_estimation_id).lean();
        if (estimation) {
          await DowryEstimation.updateOne({ _id: estimation._id }, { $set: { user_id: buyer_id } });
          estimation.user_id = buyer_id;
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      buyer,
      dowry_estimation: estimation || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── Saved Addresses ──────────────────────────────────────────────────────────

// Save a new address to buyer's saved_addresses list
async function saveAddress(req, res) {
  try {
    const { buyer_id } = req.params;
    const { line1, city, province, house_number, phone, label, is_default } = req.body || {};

    if (!line1 || !city) {
      return res.status(400).json({ success: false, error: "line1 and city are required" });
    }

    const buyer = await Buyer.findOne({ buyer_id });
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });

    const newAddress = {
      line1,
      city,
      province: province || "",
      house_number: house_number || "",
      phone: phone || buyer.phone || "",
      label: label || "Home",
      is_default: is_default || false,
    };

    // If this is set as default, unset other defaults
    if (newAddress.is_default) {
      for (const addr of buyer.saved_addresses || []) {
        addr.is_default = false;
      }
    }

    if (!Array.isArray(buyer.saved_addresses)) buyer.saved_addresses = [];
    buyer.saved_addresses.push(newAddress);
    await buyer.save();

    return res.json({ success: true, saved_addresses: buyer.saved_addresses });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Get all saved addresses for a buyer
async function getSavedAddresses(req, res) {
  try {
    const { buyer_id } = req.params;
    const buyer = await Buyer.findOne({ buyer_id }).lean();
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });
    return res.json({ success: true, saved_addresses: buyer.saved_addresses || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getBuyerProfile,
  toggleWishlist, addRecentlyViewed, syncCart, getFullBuyerData,
  saveAddress, getSavedAddresses,
};
