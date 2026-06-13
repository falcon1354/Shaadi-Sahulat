const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const buyerSchema = new mongoose.Schema(
  {
    buyer_id:      { type: String, required: true, unique: true },
    name:          { type: String, required: true, trim: true },
    email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    phone:         { type: String, default: "" },
    city:          { type: String, default: "" },
    wishlist:      { type: [String], default: [] },
    cart:          { type: Array,   default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

buyerSchema.methods.checkPassword = function (plain) {
  return bcrypt.compareSync(plain, this.password_hash);
};

module.exports = mongoose.model("Buyer", buyerSchema);
