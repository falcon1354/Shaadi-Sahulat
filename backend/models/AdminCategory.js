const mongoose = require("mongoose");

const customFieldSchema = new mongoose.Schema({
  field_id: { type: String, required: true },
  label:    { type: String, required: true },
  type:     { type: String, enum: ["text", "number", "select"], default: "text" },
  options:  { type: [String], default: [] },
  required: { type: Boolean, default: false },
}, { _id: false });

const subcategorySchema = new mongoose.Schema({
  id:            { type: String, required: true },
  label:         { type: String, required: true },
  price_min:     { type: Number, default: null },
  price_max:     { type: Number, default: null },
  custom_fields: { type: [customFieldSchema], default: [] },
}, { _id: false });

const adminCategorySchema = new mongoose.Schema(
  {
    category_id:    { type: String, required: true, unique: true },
    label:          { type: String, required: true },
    icon:           { type: String, default: "📦" },
    subcategories:  { type: [subcategorySchema], default: [] },
    price_min:      { type: Number, default: 1000 },
    price_max:      { type: Number, default: 500000 },
    is_active:      { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("AdminCategory", adminCategorySchema);
