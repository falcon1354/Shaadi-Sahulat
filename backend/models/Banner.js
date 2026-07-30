const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  banner_id: {
    type: String,
    required: true,
    unique: true,
    default: () => `BNR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  },
  title: {
    type: String,
    default: '',
  },
  image_url: {
    type: String,
    required: true,
  },
  link_type: {
    type: String,
    enum: ['product', 'category', 'custom_url'],
    default: 'product',
  },
  link_value: {
    type: String,
    default: '',
  },
  category_id: {
    type: String,
    default: '',
  },
  start_at: {
    type: Date,
    default: Date.now,
  },
  end_at: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  sort_order: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Banner', bannerSchema);
