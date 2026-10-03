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
/** Orders that should not count against dowry spent. */
const SPENT_EXCLUDED_STATUSES = new Set([
  "CANCELLED",
  "PENDING_BNPL_APPROVAL", // not finalized — pending apps often leave stuck duplicates
]);

/**
 * Reset category_budgets.spent / remaining from live orders.
 * Counts only real commitments (excludes cancelled + pending BNPL approval,
 * and BNPL orders whose application was rejected/expired/cancelled).
 * Fixes inflated spent from double-deduct and abandoned BNPL carts.
 */
async function reconcileDowrySpentFromOrders(buyer_id, estimation) {
  if (!estimation?._id || !estimation.category_budgets) return estimation;

  const Order = require("../models/Order");
  const DowryEstimation = require("../models/DowryEstimation");
  const BnplApplication = require("../models/BnplApplication");

  const orders = await Order.find({
    buyer_id,
    superseded: { $ne: true },
    status: { $nin: [...SPENT_EXCLUDED_STATUSES] },
  }).select("items payment_method bnpl_application_id status").lean();

  const bnplAppNos = [
    ...new Set(
      orders
        .filter((o) => o.payment_method === "BNPL" && o.bnpl_application_id)
        .map((o) => o.bnpl_application_id)
    ),
  ];
  const activeBnpl = new Set();
  if (bnplAppNos.length) {
    const apps = await BnplApplication.find({
      application_no: { $in: bnplAppNos },
      status: { $in: ["OFFER_ACCEPTED", "APPROVED"] },
    })
      .select("application_no")
      .lean();
    for (const a of apps) activeBnpl.add(a.application_no);
  }

  const spentByCat = {};
  for (const o of orders) {
    if (o.payment_method === "BNPL") {
      // Count BNPL only when the application is still active/finalized
      if (!o.bnpl_application_id || !activeBnpl.has(o.bnpl_application_id)) continue;
    }
    for (const it of o.items || []) {
      const cat = it.major_category || it.subcategory || "";
      if (!cat) continue;
      spentByCat[cat] = (spentByCat[cat] || 0) + (Number(it.subtotal) || 0);
    }
  }

  const budgets = { ...estimation.category_budgets };
  let changed = false;
  for (const [cat, info] of Object.entries(budgets)) {
    const spent = spentByCat[cat] || 0;
    const estimated = Number(info.estimated) || 0;
    const prevSpent = Number(info.spent) || 0;
    const remaining = estimated - spent;
    if (prevSpent !== spent || Number(info.remaining) !== remaining) {
      changed = true;
      budgets[cat] = { ...info, spent, remaining };
    }
  }

  if (changed) {
    await DowryEstimation.updateOne(
      { _id: estimation._id },
      { $set: { category_budgets: budgets } }
    );
    estimation = { ...estimation, category_budgets: budgets };
  }
  return estimation;
}

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

    if (estimation) {
      try {
        estimation = await reconcileDowrySpentFromOrders(buyer_id, estimation);
      } catch (reconcileErr) {
        console.warn("[buyer] dowry spent reconcile failed:", reconcileErr.message);
      }
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
  registerBuyer, loginBuyer, getBuyerProfile,
  toggleWishlist, addRecentlyViewed, syncCart, getFullBuyerData,
  saveAddress, getSavedAddresses,
};
