const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Banner = require('../models/Banner');
const { UPLOAD_BASE, publicUrl } = require('../lib/storage');

const BANNER_ROOT = path.join(UPLOAD_BASE, 'Banners');
if (!fs.existsSync(BANNER_ROOT)) {
  fs.mkdirSync(BANNER_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, BANNER_ROOT);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `banner-${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Invalid file type. Use JPG/PNG/WebP/GIF.'), ok);
  },
});

// ── GET /api/banners/active (Public) ──────────────────────────────────────────
// Query params: storefront=new|thrift|both (default: all), category_id
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const { storefront, category_id } = req.query;

    const filter = {
      is_active: true,
      start_at: { $lte: now },
      end_at: { $gte: now },
      // Only show approved banners (or admin-created ones with seller_offer_status='none')
      $or: [
        { seller_offer_status: 'none' },
        { seller_offer_status: 'approved' },
      ],
    };

    // Filter by storefront
    if (storefront && storefront !== 'both') {
      filter.$or = [
        { storefront: storefront },
        { storefront: 'both' },
      ];
    }

    // Filter by category
    if (category_id) {
      filter.$or = [
        { category_id: category_id },
        { category_id: '' },
        { category_id: { $exists: false } },
      ];
    }

    const banners = await Banner.find(filter)
      .sort({ sort_order: 1, created_at: -1 })
      .lean();

    return res.json({
      success: true,
      banners: banners.map(b => ({
        ...b,
        image_url: b.image_url.startsWith('http') ? b.image_url : publicUrl(b.image_url),
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/banners (Admin list all) ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ sort_order: 1, created_at: -1 }).lean();
    return res.json({
      success: true,
      banners: banners.map(b => ({
        ...b,
        image_url: b.image_url.startsWith('http') ? b.image_url : publicUrl(b.image_url),
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/banners/seller-offers (Admin: list pending seller offers) ────────
router.get('/seller-offers', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { seller_offer_status: { $ne: 'none' } };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.seller_offer_status = status;
    }

    const offers = await Banner.find(filter).sort({ created_at: -1 }).lean();
    return res.json({
      success: true,
      offers: offers.map(b => ({
        ...b,
        image_url: b.image_url.startsWith('http') ? b.image_url : publicUrl(b.image_url),
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/banners/seller-offer (Seller creates promotional offer) ─────────
router.post('/seller-offer', upload.single('image'), async (req, res) => {
  try {
    const { seller_id, seller_name, title, link_type, link_value, start_at, end_at,
            category_id, storefront, product_ids, offer_text } = req.body || {};

    if (!seller_id) {
      return res.status(400).json({ success: false, error: 'seller_id is required' });
    }
    if (!title && !offer_text) {
      return res.status(400).json({ success: false, error: 'Title or offer text is required' });
    }

    // Validate schedule
    const start = start_at ? new Date(start_at) : new Date();
    const end = end_at ? new Date(end_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    if (start < now) {
      return res.status(400).json({ success: false, error: 'Start time must be in the future' });
    }
    const durationHours = (end - start) / (1000 * 60 * 60);
    if (durationHours > 72) {
      return res.status(400).json({ success: false, error: 'Banner duration cannot exceed 3 days (72 hours)' });
    }
    if (end <= start) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }

    let imageUrl = '';
    if (req.file) {
      imageUrl = path.join('Banners', req.file.filename).split(path.sep).join('/');
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else {
      return res.status(400).json({ success: false, error: 'Banner image is required' });
    }

    const banner = new Banner({
      title: title || offer_text || '',
      image_url: imageUrl,
      link_type: link_type || 'product',
      link_value: link_value || '',
      category_id: category_id || '',
      storefront: storefront || 'new',
      seller_id,
      seller_name: seller_name || '',
      seller_product_ids: product_ids ? (typeof product_ids === 'string' ? product_ids.split(',').filter(Boolean) : product_ids) : [],
      seller_offer_status: 'pending',
      start_at: start,
      end_at: end,
      is_active: false, // Not active until admin approves
      sort_order: 0,
    });

    await banner.save();

    return res.json({
      success: true,
      message: 'Seller offer submitted for admin review',
      banner: {
        ...banner.toObject(),
        image_url: banner.image_url.startsWith('http') ? banner.image_url : publicUrl(banner.image_url),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/banners/seller-offer/:id/approve (Admin approves seller offer) ───
router.put('/seller-offer/:id/approve', async (req, res) => {
  try {
    const banner = await Banner.findOne({ banner_id: req.params.id }) || await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner offer not found' });
    }
    if (banner.seller_offer_status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Offer is not in pending state' });
    }

    banner.seller_offer_status = 'approved';
    banner.is_active = true;
    if (req.body.suggested_price) {
      banner.suggested_price = Number(req.body.suggested_price);
    }
    await banner.save();

    return res.json({
      success: true,
      message: 'Seller offer approved — banner is now active',
      banner: {
        ...banner.toObject(),
        image_url: banner.image_url.startsWith('http') ? banner.image_url : publicUrl(banner.image_url),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/banners/seller-offer/:id/reject (Admin rejects seller offer) ─────
router.put('/seller-offer/:id/reject', async (req, res) => {
  try {
    const banner = await Banner.findOne({ banner_id: req.params.id }) || await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner offer not found' });
    }
    if (banner.seller_offer_status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Offer is not in pending state' });
    }

    banner.seller_offer_status = 'rejected';
    banner.is_active = false;
    banner.admin_rejection_reason = req.body.reason || '';
    if (req.body.suggested_price) {
      banner.suggested_price = Number(req.body.suggested_price);
    }
    await banner.save();

    return res.json({
      success: true,
      message: 'Seller offer rejected',
      banner: {
        ...banner.toObject(),
        image_url: banner.image_url.startsWith('http') ? banner.image_url : publicUrl(banner.image_url),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/banners (Admin create) ──────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, link_type, link_value, start_at, end_at, is_active, sort_order, category_id, storefront } = req.body || {};

    let imageUrl = '';
    if (req.file) {
      imageUrl = path.join('Banners', req.file.filename).split(path.sep).join('/');
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else {
      return res.status(400).json({ success: false, error: 'Banner image is required' });
    }

    const banner = new Banner({
      title: title || '',
      image_url: imageUrl,
      link_type: link_type || 'product',
      link_value: link_value || '',
      category_id: category_id || '',
      storefront: storefront || 'new',
      seller_offer_status: 'none',
      start_at: start_at ? new Date(start_at) : new Date(),
      end_at: end_at ? new Date(end_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      is_active: is_active === undefined ? true : String(is_active) === 'true',
      sort_order: Number(sort_order) || 0,
    });

    await banner.save();

    return res.json({
      success: true,
      message: 'Banner created successfully',
      banner: {
        ...banner.toObject(),
        image_url: banner.image_url.startsWith('http') ? banner.image_url : publicUrl(banner.image_url),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/banners/:id (Admin update) ───────────────────────────────────────
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const banner = await Banner.findOne({ banner_id: req.params.id }) || await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }

    const { title, link_type, link_value, start_at, end_at, is_active, sort_order, category_id, storefront } = req.body || {};

    if (req.file) {
      banner.image_url = path.join('Banners', req.file.filename).split(path.sep).join('/');
    } else if (req.body.image_url) {
      banner.image_url = req.body.image_url;
    }

    if (title !== undefined) banner.title = title;
    if (link_type !== undefined) banner.link_type = link_type;
    if (link_value !== undefined) banner.link_value = link_value;
    if (category_id !== undefined) banner.category_id = category_id;
    if (storefront !== undefined) banner.storefront = storefront;
    if (start_at) banner.start_at = new Date(start_at);
    if (end_at) banner.end_at = new Date(end_at);
    if (is_active !== undefined) banner.is_active = String(is_active) === 'true';
    if (sort_order !== undefined) banner.sort_order = Number(sort_order);

    await banner.save();

    return res.json({
      success: true,
      message: 'Banner updated successfully',
      banner: {
        ...banner.toObject(),
        image_url: banner.image_url.startsWith('http') ? banner.image_url : publicUrl(banner.image_url),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/banners/:id (Admin delete) ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const banner = await Banner.findOneAndDelete({ banner_id: req.params.id }) || await Banner.findByIdAndDelete(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }

    // Delete the image file from disk
    if (banner.image_url && !banner.image_url.startsWith('http')) {
      const imgPath = path.join(UPLOAD_BASE, banner.image_url);
      if (fs.existsSync(imgPath)) {
        try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
      }
    }

    return res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Auto-cleanup expired banners (called by server.js timer) ──────────────────
async function cleanupExpiredBanners() {
  try {
    const now = new Date();
    const expired = await Banner.find({
      end_at: { $lt: now },
      is_active: true,
    }).lean();

    for (const banner of expired) {
      // Delete image file from disk
      if (banner.image_url && !banner.image_url.startsWith('http')) {
        const imgPath = path.join(UPLOAD_BASE, banner.image_url);
        if (fs.existsSync(imgPath)) {
          try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
        }
      }
      // Remove the DB record completely
      await Banner.deleteOne({ _id: banner._id });
      console.log(`[BannerCleanup] Expired banner removed: ${banner.banner_id} (${banner.title})`);
    }

    if (expired.length > 0) {
      console.log(`[BannerCleanup] Cleaned up ${expired.length} expired banner(s)`);
    }
  } catch (err) {
    console.error('[BannerCleanup] Error:', err.message);
  }
}

module.exports = { router, cleanupExpiredBanners };
