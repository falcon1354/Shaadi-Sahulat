const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    admin_id:      { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    email:         { type: String, required: true, unique: true, lowercase: true },
    password_hash: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

adminSchema.methods.checkPassword = function (plain) {
  return bcrypt.compareSync(plain, this.password_hash);
};

module.exports = mongoose.model("Admin", adminSchema);
