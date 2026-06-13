const express = require("express");
const router  = express.Router();
const { registerBuyer, loginBuyer, getBuyerProfile } = require("../controllers/buyerController");

router.post("/register",              registerBuyer);
router.post("/login",                 loginBuyer);
router.get( "/profile/:buyer_id",     getBuyerProfile);

module.exports = router;
