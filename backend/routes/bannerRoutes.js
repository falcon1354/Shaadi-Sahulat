const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Banner = require('../models/Banner');

// Auto-clean expired banners from DB and disk storage
const cleanupExpiredBanners = async () => {
  const now = new Date();
  const expiredBanners = await Banner.find({ end_at: { $lt: now } });

  for (const banner of expiredBanners) {
    if (banner.imageUrl) {
      // Remove physical image file from upload/Banner
      const filename = path.basename(banner.imageUrl);
      const filePath = path.join(__dirname, '../../upload/Banner', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await Banner.findByIdAndDelete(banner._id);
  }
};

// Fetch Active Banners for Frontend (Marketplace or Category Page)
router.get('/active', async (req, res) => {
  try {
    await cleanupExpiredBanners();
    const { categoryId } = req.query;
    const now = new Date();

    const query = {
      is_active: true,
      status: 'APPROVED',
      start_at: { $lte: now },
      end_at: { $gte: now }
    };

    if (categoryId && categoryId !== 'ALL') {
      query.$or = [{ category_id: categoryId }, { category_id: 'ALL' }];
    }

    const banners = await Banner.find(query).sort({ sort_order: 1 });
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seller Submit Banner Request
router.post('/seller-request', async (req, res) => {
  try {
    const { title, targetProductId, category_id, imageUrl } = req.body;
    const banner = new Banner({
      title,
      targetProductId,
      category_id,
      imageUrl,
      sellerId: req.user._id,
      status: 'PENDING',
      start_at: new Date(),
      end_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // Default max 3 days
    });
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;