const express = require("express");
const router  = express.Router();
const {
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
  updateCategoryIcon,
  updateCategoryPlaceholder,
  deleteCategory,
  editCategory,
} = require("../controllers/adminController");
const {
  makeCategoryIconUploadMiddleware,
  makeCategoryPlaceholderUploadMiddleware,
} = require("../lib/storage");

// BNPL + Order Processing admin extensions
const adminExtRoutes = require("./adminExt");

// Auth
router.post("/login",   loginAdmin);

// Sellers
router.get( "/sellers",                     getAllSellers);
router.get( "/sellers/:seller_id/products", getSellerProducts);
router.delete("/product/:product_id",       removeProduct);
router.patch("/product/:product_id/freeze",   freezeProduct);
router.patch("/product/:product_id/unfreeze", unfreezeProduct);

// Buyers
router.get("/buyers", getAllBuyers);

// Financial + Products
router.get("/stats",    getFinancialStats);
router.get("/products", getAllProducts);

// Categories
router.get( "/categories",                                           getCategories);
router.post("/categories", (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return makeCategoryPlaceholderUploadMiddleware()(req, res, next);
  }
  return next();
}, addCategory);
router.post("/categories/:category_id/icon", makeCategoryIconUploadMiddleware(), updateCategoryIcon);
router.post("/categories/:category_id/placeholder", makeCategoryPlaceholderUploadMiddleware(), updateCategoryPlaceholder);
router.delete("/categories/:category_id",                            deleteCategory);
router.put( "/categories/:category_id",                              editCategory);
router.post("/categories/:category_id/subcategory",                  addSubcategory);
router.patch("/categories/:category_id/prices",                      updateCategoryPrices);
router.post("/categories/:category_id/subcategory/:subcategory_id/field",          addCustomField);
router.delete("/categories/:category_id/subcategory/:subcategory_id/field/:field_id", removeCustomField);
router.patch("/categories/:category_id/subcategory/:subcategory_id/prices",          updateSubcategoryPrices);

// ── BNPL + Order Processing admin extensions ───────────────────────────────
// (orders, disputes, release-payment, wallet, payouts, bnpl oversight)
router.use(adminExtRoutes);

module.exports = router;
