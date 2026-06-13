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

// ── Seller registration / auth ────────────────────────────────────────────

async function registerSeller({ name, email, password, phone, city }) {
  const res = await axios.post(`${ML_URL}/seller/register`, { name, email, password, phone, city }, {
    timeout: TIMEOUT,
  });
  return res.data;
}

async function loginSeller({ email, password }) {
  const res = await axios.post(`${ML_URL}/seller/login`, { email, password }, {
    timeout: TIMEOUT,
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
  const textFields = [
    "seller_id", "title", "description",
    "major_category", "subcategory", "item_type",
    "wedding_dress_type", "color", "fabric", "embroidery_type", "size",
    "material", "brand", "condition", "city",
    "price", "discount_price", "discount_pct", "stock_quantity",
    // legacy fallback
    "category",
  ];
  for (const key of textFields) {
    if (fields[key] !== undefined && fields[key] !== "") {
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

async function searchProducts({ q, major_category, limit } = {}) {
  const res = await axios.get(`${ML_URL}/seller/search`, {
    params: { q, major_category, limit },
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
  registerSeller:    _wrap(registerSeller),
  loginSeller:       _wrap(loginSeller),
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
