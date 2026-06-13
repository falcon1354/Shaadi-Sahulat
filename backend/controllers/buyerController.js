const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const Buyer  = require("../models/Buyer");

async function registerBuyer(req, res) {
  try {
    const { name, email, password, phone = "", city = "" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "password must be at least 6 characters" });
    }

    const existing = await Buyer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: "Email already registered" });
    }

    const hash   = bcrypt.hashSync(password, 10);
    const buyer  = new Buyer({
      buyer_id:      `buyer_${uuidv4().replace(/-/g, "").slice(0, 16)}`,
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      password_hash: hash,
      phone,
      city,
    });

    const saved = await buyer.save();
    const { password_hash: _, ...safe } = saved.toObject();
    return res.status(201).json({ success: true, buyer: safe });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function loginBuyer(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "email and password are required" });
    }

    const buyer = await Buyer.findOne({ email: email.toLowerCase().trim() });
    if (!buyer || !buyer.checkPassword(password)) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }

    const { password_hash: _, ...safe } = buyer.toObject();
    return res.json({ success: true, buyer: safe });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getBuyerProfile(req, res) {
  try {
    const buyer = await Buyer.findOne({ buyer_id: req.params.buyer_id }).lean();
    if (!buyer) return res.status(404).json({ success: false, error: "Buyer not found" });
    delete buyer.password_hash;
    return res.json({ success: true, buyer });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { registerBuyer, loginBuyer, getBuyerProfile };
