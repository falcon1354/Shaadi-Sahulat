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
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const banners = await Banner.find({
      is_active: true,
      start_at: { $lte: now },
      end_at: { $gte: now },
    })
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

// ── POST /api/banners (Admin create) ──────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, link_type, link_value, start_at, end_at, is_active, sort_order, category_id } = req.body || {};

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

    const { title, link_type, link_value, start_at, end_at, is_active, sort_order, category_id } = req.body || {};

    if (req.file) {
      banner.image_url = path.join('Banners', req.file.filename).split(path.sep).join('/');
    } else if (req.body.image_url) {
      banner.image_url = req.body.image_url;
    }

    if (title !== undefined) banner.title = title;
    if (link_type !== undefined) banner.link_type = link_type;
    if (link_value !== undefined) banner.link_value = link_value;
    if (category_id !== undefined) banner.category_id = category_id;
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
    return res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;