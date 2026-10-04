const express = require("express");
const router  = express.Router();
const {
  getBuyerProfile,
  toggleWishlist, addRecentlyViewed, syncCart, getFullBuyerData,
  saveAddress, getSavedAddresses,
} = require("../controllers/buyerController");
const { requireSelfParam, endpointRemoved } = require("../lib/authorize");

// :buyer_id must be the signed-in buyer (admins may read, never mutate).
const selfRead  = requireSelfParam("buyer_id", { role: "buyer", allowAdmin: true });
const selfWrite = requireSelfParam("buyer_id", { role: "buyer" });

// Legacy auth endpoints were removed in Phase 2I (all methods → 410 Gone).
router.all("/register", endpointRemoved("POST /api/auth/buyer/register"));
router.all("/login",    endpointRemoved("POST /api/auth/login"));
router.get( "/profile/:buyer_id",                 selfRead,  getBuyerProfile);
router.get( "/:buyer_id/full-data",               selfRead,  getFullBuyerData);
router.patch("/:buyer_id/wishlist-toggle",        selfWrite, toggleWishlist);
router.post( "/:buyer_id/recently-viewed",        selfWrite, addRecentlyViewed);
router.post( "/:buyer_id/cart-sync",              selfWrite, syncCart);
router.post( "/:buyer_id/save-address",           selfWrite, saveAddress);
router.get(  "/:buyer_id/saved-addresses",        selfRead,  getSavedAddresses);

module.exports = router;
