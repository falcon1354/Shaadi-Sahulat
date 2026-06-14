const express = require("express");
const router  = express.Router();
const {
  registerBuyer, loginBuyer, getBuyerProfile,
  toggleWishlist, addRecentlyViewed, syncCart, getFullBuyerData,
} = require("../controllers/buyerController");

router.post("/register",                          registerBuyer);
router.post("/login",                             loginBuyer);
router.get( "/profile/:buyer_id",                 getBuyerProfile);
router.get( "/:buyer_id/full-data",               getFullBuyerData);
router.patch("/:buyer_id/wishlist-toggle",        toggleWishlist);
router.post( "/:buyer_id/recently-viewed",        addRecentlyViewed);
router.post( "/:buyer_id/cart-sync",              syncCart);

module.exports = router;
