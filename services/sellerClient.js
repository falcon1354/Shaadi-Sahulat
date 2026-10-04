/**
 * ShaadiSahulat - Seller ML Service Client
 * =========================================
 * HTTP client that forwards requests from Node.js to the Python Flask
 * seller endpoints.  Handles JSON calls and multipart image uploads.
 */

const axios    = require("axios");
const FormData = require("form-data");

const ML_URL  = process.env.VISUAL_ML_URL || "http://localhost:5002";
const TIMEOUT = 60000; // 60 s — image embedding can take a moment

// ── Seller account creation (Node /api/auth/seller/register is the only entry point) ──

/**
 * INTERNAL: create a seller with a Node-computed bcrypt hash + auth state.
 * Flask keeps the authoritative seller_type / max_listings / seller_id rules.
 */
async function createSellerInternal({ name, email, phone, city, seller_type, password_hash, auth }) {
  const flaskHttp = require("../lib/flaskHttp");
  const res = await flaskHttp.post("/seller/internal/create", {
    name, email, phone, city, seller_type, password_hash, auth,
  });
  return res.data;
}

async function getSellerProfile(sellerId) {
  const res = await axios.get(`${ML_URL}/seller/profile/${sellerId}`, { timeout: TIMEOUT });
  return res.data;
}

async function getSellerByEmail(email) {
  const res = await axios.get(`${ML_URL}/seller/by-email`, {
    params: { email },
    timeout: TIMEOUT,
  });
  return res.data;
}

// ── Product upload ─────────────────────────────────────────────────────────

/**
 * Forward a multipart product upload to the Flask ML service.
 *
 * @param {Object} fields   — text fields from req.body
 * @param {Array}  files    — file objects from multer (req.files)
 */
async function uploadProduct(fields, files) {
  const form = new FormData();

  // Append all text fields (new expanded schema)
  // IMPORTANT: keep this list in sync with the Flask route at
  // visual-ml-service/seller_routes.py upload_product().
  const textFields = [
    "seller_id", "title", "name", "description",
    "major_category", "subcategory", "item_type",
    "wedding_dress_type", "color", "fabric", "embroidery_type", "size",
    "material", "brand", "condition", "city",
    "price", "discount_price", "discount_pct", "stock_quantity",
    "original_price",
    "marketplace_type", "is_thrift",
    "availability_status",
    "is_hot_deal", "is_best_seller",
    "primary_image_url", "image_url",
    // JSON-encoded custom fields (admin-defined per category)
    "custom_field_values",
    // legacy fallback
    "category",
  ];
  for (const key of textFields) {
    if (fields[key] !== undefined && fields[key] !== "") {
      // custom_field_values is sent as a JSON string from the frontend
      form.append(key, String(fields[key]));
    }
  }

  // Append image files
  for (const file of files) {
    form.append("images", file.buffer, {
      filename:    file.originalname,
      contentType: file.mimetype,
    });
  }

  const res = await axios.post(`${ML_URL}/seller/product`, form, {
    headers: {
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength:    Infinity,
    timeout:          TIMEOUT,
  });
  return res.data;
}

// ── Product list / detail ──────────────────────────────────────────────────

async function listProducts({ sellerId, category, status, page, limit }) {
  const res = await axios.get(`${ML_URL}/seller/products`, {
    params: { seller_id: sellerId, category, status, page, limit },
    timeout: TIMEOUT,
  });
  return res.data;
}

async function getProduct(productId) {
  const res = await axios.get(`${ML_URL}/seller/product/${productId}`, { timeout: TIMEOUT });
  return res.data;
}

async function updateProduct(productId, updates) {
  const res = await axios.put(`${ML_URL}/seller/product/${productId}`, updates, {
    timeout: TIMEOUT,
  });
  return res.data;
}

async function deleteProduct(productId) {
  const res = await axios.delete(`${ML_URL}/seller/product/${productId}`, { timeout: TIMEOUT });
  return res.data;
}

// ── Marketplace (public browse) ────────────────────────────────────────────

async function getPublicProducts(params = {}) {
  const res = await axios.get(`${ML_URL}/seller/products/public`, {
    params,
    timeout: TIMEOUT,
  });
  return res.data;
}

async function getCategories() {
  const res = await axios.get(`${ML_URL}/seller/categories`, { timeout: TIMEOUT });
  return res.data;
}

// ── TF-IDF Text Search ─────────────────────────────────────────────────────

async function searchProducts({ q, major_category, marketplace_type, limit } = {}) {
  const res = await axios.get(`${ML_URL}/seller/search`, {
    params: { q, major_category, marketplace_type, limit },
    timeout: TIMEOUT,
  });
  return res.data;
}

// ── Price suggestion ───────────────────────────────────────────────────────

async function getPriceSuggestion({ major_category, subcategory, item_type, color, condition } = {}) {
  const res = await axios.get(`${ML_URL}/dowry/price-suggestion`, {
    params: { major_category, subcategory, item_type, color, condition },
    timeout: 10000,
  });
  return res.data;
}

// ── Error wrapper ──────────────────────────────────────────────────────────

function _wrap(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        return { success: false, error: "ML service unavailable (port 5002 not running)." };
      }
      if (err.response) {
        return err.response.data;
      }
      return { success: false, error: err.message };
    }
  };
}

module.exports = {
  createSellerInternal: _wrap(createSellerInternal),
  getSellerProfile:  _wrap(getSellerProfile),
  getSellerByEmail:  _wrap(getSellerByEmail),
  uploadProduct:     _wrap(uploadProduct),
  listProducts:      _wrap(listProducts),
  getPublicProducts: _wrap(getPublicProducts),
  getCategories:     _wrap(getCategories),
  getProduct:        _wrap(getProduct),
  updateProduct:     _wrap(updateProduct),
  deleteProduct:     _wrap(deleteProduct),
  searchProducts:    _wrap(searchProducts),
  getPriceSuggestion: _wrap(getPriceSuggestion),
};
