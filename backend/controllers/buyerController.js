const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const Buyer  = require("../models/Buyer");

async function registerBuyer(req, res) {
  try {
    const { name, email, password, phone = "", city = "" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "password must be at least 6 characters" });
    }

    const existing = await Buyer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: "Email already registered" });
    }

    const hash  = bcrypt.hashSync(password, 10);
    const buyer = new Buyer({
      buyer_id:      `buyer_${uuidv4().replace(/-/g, "").slice(0, 16)}`,
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      password_hash: hash,
      phone,
      city,
    });

    const saved = await buyer.save();
    const { password_hash: _, ...safe } = saved.toObject();
    return res.status(201).json({ success: true, buyer: safe });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function loginBuyer(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "email and password are required" });
    }

    const buyer = await Buyer.findOne({ email: email.toLowerCase().trim() });
    if (!buyer || !buyer.checkPassword(password)) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const { password_hash: _, ...safe } = buyer.toObject();
    return res.json({ success: true, buyer: safe });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

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
async function syncCart(req, res) {
  try {
    const { buyer_id } = req.params;
    const { cart_items } = req.body;
    if (!Array.isArray(cart_items)) return res.status(400).json({ success: false, error: "cart_items must be an array" });

    const buyer = await Buyer.findOneAndUpdate(
      { buyer_id },
      { $set: { cart_items } },
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

module.exports = {
  registerBuyer, loginBuyer, getBuyerProfile,
  toggleWishlist, addRecentlyViewed, syncCart, getFullBuyerData,
};
