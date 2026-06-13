const mongoose = require("mongoose");

// Anonymized training records — seeded (is_system: true) + real buyers (is_system: false)
const dowryTrainingSchema = new mongoose.Schema({
  is_system:                { type: Boolean, default: false, index: true },
  income:                   { type: Number, required: true, index: true },
  savings:                  { type: Number, default: 0 },
  total_family_members:     { type: Number, default: 4 },
  total_recommended_budget: { type: Number, required: true },
  responsibility_score:     { type: Number, default: 0.5 },
  category_breakdown: {
    wedding_dress: { type: Number, default: 0 },
    furniture:     { type: Number, default: 0 },
    electronics:   { type: Number, default: 0 },
    jewelry:       { type: Number, default: 0 },
    kitchen_items: { type: Number, default: 0 },
    decoration:    { type: Number, default: 0 },
    miscellaneous: { type: Number, default: 0 },
  },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DowryTraining", dowryTrainingSchema);
