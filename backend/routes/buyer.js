const express = require("express");
const router  = express.Router();
const { registerBuyer, loginBuyer, getBuyerProfile, toggleWishlist, addRecentlyViewed } = require("../controllers/buyerController");

router.post("/register",                          registerBuyer);
router.post("/login",                             loginBuyer);
router.get( "/profile/:buyer_id",                 getBuyerProfile);
router.patch("/:buyer_id/wishlist-toggle",        toggleWishlist);
router.post( "/:buyer_id/recently-viewed",        addRecentlyViewed);

module.exports = router;
