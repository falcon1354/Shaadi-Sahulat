/**
 * ShaadiSahulat - Seller Controller
 * ===================================
 * Express request handlers for the /api/seller/* routes.
 * All heavy lifting is delegated to sellerClient → Flask ML service.
 */

const sellerClient = require("../services/sellerClient");

// ── Seller registration ────────────────────────────────────────────────────

async function registerSeller(req, res) {
  try {
    const result = await sellerClient.registerSeller(req.body);
    const code   = result.success === false ? (result.error?.includes("already") ? 409 : 400) : 201;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function loginSeller(req, res) {
  try {
    const result = await sellerClient.loginSeller(req.body);
    const code   = result.success === false ? 401 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getSellerProfile(req, res) {
  try {
    const result = await sellerClient.getSellerProfile(req.params.seller_id);
    const code   = result.success === false ? 404 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getSellerByEmail(req, res) {
  try {
    const result = await sellerClient.getSellerByEmail(req.query.email);
    const code   = result.success === false ? 404 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── Product upload ─────────────────────────────────────────────────────────

async function uploadProduct(req, res) {
  try {
    const files  = req.files || [];
    const result = await sellerClient.uploadProduct(req.body, files);
    const code   = result.success === false ? 400 : 201;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── Product CRUD ───────────────────────────────────────────────────────────

async function listProducts(req, res) {
  try {
    const { seller_id, category, status, page, limit } = req.query;
    const result = await sellerClient.listProducts({
      sellerId: seller_id,
      category,
      status,
      page:  page  ? parseInt(page)  : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getProduct(req, res) {
  try {
    const result = await sellerClient.getProduct(req.params.product_id);
    const code   = result.success === false ? 404 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function updateProduct(req, res) {
  try {
    const result = await sellerClient.updateProduct(req.params.product_id, req.body);
    const code   = result.success === false ? 404 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteProduct(req, res) {
  try {
    const result = await sellerClient.deleteProduct(req.params.product_id);
    const code   = result.success === false ? 404 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getPublicProducts(req, res) {
  try {
    const result = await sellerClient.getPublicProducts(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getCategories(req, res) {
  try {
    const result = await sellerClient.getCategories();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function searchProducts(req, res) {
  try {
    const { q, major_category, limit } = req.query;
    const result = await sellerClient.searchProducts({ q, major_category, limit });
    const code   = result.success === false ? 400 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getPriceSuggestion(req, res) {
  try {
    const { major_category, subcategory, item_type, color, condition } = req.query;
    const result = await sellerClient.getPriceSuggestion({ major_category, subcategory, item_type, color, condition });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  registerSeller,
  loginSeller,
  getSellerProfile,
  getSellerByEmail,
  uploadProduct,
  listProducts,
  getPublicProducts,
  getCategories,
  getProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getPriceSuggestion,
};
