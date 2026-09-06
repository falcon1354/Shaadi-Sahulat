const mongoose = require("mongoose");

// Anonymized training records — seeded (is_system: true) + real buyers (is_system: false)
const dowryTrainingSchema = new mongoose.Schema({
  is_system:                { type: Boolean, default: false, index: true },
  income:                   { type: Number, required: true, index: true },
  savings:                  { type: Number, default: 0 },
  total_family_members:     { type: Number, default: 4 },
  total_recommended_budget: { type: Number, required: true },
  responsibility_score:     { type: Number, default: 0.5 },
  // Mixed type so it accepts dynamically added admin categories
  category_breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DowryTraining", dowryTrainingSchema);
