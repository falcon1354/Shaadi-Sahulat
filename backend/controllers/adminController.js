const bcrypt        = require("bcryptjs");
const path          = require("path");
const fs            = require("fs");
const Admin         = require("../models/Admin");
const AdminCategory = require("../models/AdminCategory");
const Buyer         = require("../models/Buyer");
const DowryEstimation = require("../models/DowryEstimation");

const VISUAL_ML_URL  = process.env.VISUAL_ML_URL || "http://localhost:5002";
const UPLOADS_DIR    = path.join(__dirname, "../../visual-ml-service/uploads");

// Helper: call Flask ML service
async function mlFetch(endpoint, options = {}) {
  const axios = require("axios");
  return axios({ url: `${VISUAL_ML_URL}${endpoint}`, timeout: 10000, ...options })
    .then(r => r.data)
    .catch(() => null);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function loginAdmin(req, res) {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: email?.toLowerCase() }).lean();
    if (!admin) return res.status(401).json({ success: false, error: "Invalid credentials" });
    const ok = bcrypt.compareSync(password, admin.password_hash);
    if (!ok)  return res.status(401).json({ success: false, error: "Invalid credentials" });
    const { password_hash, ...safe } = admin;
    return res.json({ success: true, admin: safe });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ── Sellers ───────────────────────────────────────────────────────────────────

async function getAllSellers(req, res) {
  try {
    const data = await mlFetch("/seller/all");
    if (!data) return res.json({ success: true, sellers: [] });
    return res.json({ success: true, sellers: data.sellers || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function getSellerProducts(req, res) {
  try {
    const { seller_id } = req.params;
    const data = await mlFetch(`/seller/products?seller_id=${seller_id}&limit=200`);
    return res.json({ success: true, products: data?.products || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function removeProduct(req, res) {
  try {
    const { product_id } = req.params;
    const data = await mlFetch(`/seller/product/${product_id}`, { method: "DELETE" });
    // Delete local image folders
    const dirs = _findProductDirs(product_id);
    dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
    // Cascade: remove from all buyer wishlist_items and cart_items
    await Buyer.updateMany(
      {},
      {
        $pull: {
          wishlist_items: { product_id },
          cart_items:     { product_id },
        },
      }
    );
    return res.json({ success: true, deleted: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function freezeProduct(req, res) {
  try {
    const { product_id } = req.params;
    const data = await mlFetch(`/seller/product/${product_id}`, {
      method: "PUT",
      data: { availability_status: "frozen" },
    });
    return res.json({ success: true, product: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function unfreezeProduct(req, res) {
  try {
    const { product_id } = req.params;
    const data = await mlFetch(`/seller/product/${product_id}`, {
      method: "PUT",
      data: { availability_status: "available" },
    });
    return res.json({ success: true, product: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

function _findProductDirs(product_id) {
  const found = [];
  if (!fs.existsSync(UPLOADS_DIR)) return found;
  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (entry === product_id) found.push(full);
          else walk(full);
        }
      }
    } catch {}
  }
  walk(UPLOADS_DIR);
  return found;
}

// ── Buyers ────────────────────────────────────────────────────────────────────

async function getAllBuyers(req, res) {
  try {
    const buyers = await Buyer.find({}).select("-password_hash").lean();
    const estimations = await DowryEstimation.find({}).lean();
    const estMap = {};
    for (const e of estimations) estMap[e.user_id] = e;

    const result = buyers.map(b => ({
      ...b,
      dowry_estimation: estMap[b.buyer_id] || null,
    }));
    return res.json({ success: true, buyers: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ── Financial stats ───────────────────────────────────────────────────────────

async function getFinancialStats(req, res) {
  try {
    const [buyerCount, estCount] = await Promise.all([
      Buyer.countDocuments(),
      DowryEstimation.countDocuments(),
    ]);

    // Get product/seller stats from ML service
    const statsData = await mlFetch("/seller/stats");

    return res.json({
      success:         true,
      buyer_count:     buyerCount,
      estimation_count: estCount,
      seller_count:    statsData?.seller_count    || 0,
      product_count:   statsData?.product_count   || 0,
      category_stats:  statsData?.category_stats  || [],
      revenue_simulated: statsData?.revenue_simulated || 0,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function getAllProducts(req, res) {
  try {
    const { major_category, page = 1, limit = 50 } = req.query;
    let url = `/seller/products?limit=${limit}&page=${page}`;
    if (major_category) url += `&major_category=${major_category}`;
    const data = await mlFetch(url);
    return res.json({ success: true, products: data?.products || [], total: data?.total || 0 });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ── Categories ────────────────────────────────────────────────────────────────

async function getCategories(req, res) {
  try {
    const cats = await AdminCategory.find({}).lean();
    return res.json({ success: true, categories: cats });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function addCategory(req, res) {
  try {
    const { category_id, label, icon, price_min, price_max } = req.body;
    if (!category_id || !label)
      return res.status(400).json({ success: false, error: "category_id and label required" });
    const cat = await AdminCategory.create({
      category_id, label, icon: icon || "📦",
      price_min: price_min || 1000,
      price_max: price_max || 500000,
    });
    return res.status(201).json({ success: true, category: cat });
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ success: false, error: "Category already exists" });
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function addSubcategory(req, res) {
  try {
    const { category_id } = req.params;
    const { id, label, custom_fields = [] } = req.body;
    const cat = await AdminCategory.findOneAndUpdate(
      { category_id },
      { $push: { subcategories: { id, label, custom_fields } } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, error: "Category not found" });
    return res.json({ success: true, category: cat });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function updateCategoryPrices(req, res) {
  try {
    const { category_id } = req.params;
    const { price_min, price_max } = req.body;
    const cat = await AdminCategory.findOneAndUpdate(
      { category_id },
      { $set: { price_min, price_max } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, error: "Category not found" });
    return res.json({ success: true, category: cat });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function addCustomField(req, res) {
  try {
    const { category_id, subcategory_id } = req.params;
    const field = req.body;
    const cat = await AdminCategory.findOneAndUpdate(
      { category_id, "subcategories.id": subcategory_id },
      { $push: { "subcategories.$.custom_fields": field } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, error: "Category/subcategory not found" });
    return res.json({ success: true, category: cat });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function removeCustomField(req, res) {
  try {
    const { category_id, subcategory_id, field_id } = req.params;
    const cat = await AdminCategory.findOneAndUpdate(
      { category_id, "subcategories.id": subcategory_id },
      { $pull: { "subcategories.$.custom_fields": { field_id } } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, category: cat });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function updateSubcategoryPrices(req, res) {
  try {
    const { category_id, subcategory_id } = req.params;
    const { price_min, price_max } = req.body;
    const cat = await AdminCategory.findOneAndUpdate(
      { category_id, "subcategories.id": subcategory_id },
      { $set: { "subcategories.$.price_min": Number(price_min), "subcategories.$.price_max": Number(price_max) } },
      { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, category: cat });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

module.exports = {
  loginAdmin,
  getAllSellers,
  getSellerProducts,
  removeProduct,
  freezeProduct,
  unfreezeProduct,
  getAllBuyers,
  getFinancialStats,
  getAllProducts,
  getCategories,
  addCategory,
  addSubcategory,
  updateCategoryPrices,
  addCustomField,
  removeCustomField,
  updateSubcategoryPrices,
};
