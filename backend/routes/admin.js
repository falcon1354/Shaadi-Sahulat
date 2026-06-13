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
} = require("../controllers/adminController");

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
router.post("/categories",                                           addCategory);
router.post("/categories/:category_id/subcategory",                  addSubcategory);
router.patch("/categories/:category_id/prices",                      updateCategoryPrices);
router.post("/categories/:category_id/subcategory/:subcategory_id/field",          addCustomField);
router.delete("/categories/:category_id/subcategory/:subcategory_id/field/:field_id", removeCustomField);
router.patch("/categories/:category_id/subcategory/:subcategory_id/prices",          updateSubcategoryPrices);

module.exports = router;
