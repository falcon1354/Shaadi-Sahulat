/**
 * ShaadiSahulat - Visual Recommendation Controller
 * ===================================================
 * Request handlers for the visual recommendation API endpoints.
 */

const visualClient = require("../services/visualClient");
const VisualRecommendation = require("../models/VisualRecommendation");

/**
 * POST /api/visual/recommend
 * Upload an image and get similar dress recommendations
 */
exports.recommend = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        reason: "No image file provided. Use 'image' field in multipart/form-data.",
      });
    }

    const preferredCategory = req.body.preferred_category || null;
    const limit       = parseInt(req.body.limit) || 10;
    const userId      = req.body.user_id || "anonymous";
    const description = (req.body.description || "").trim();

    // Send to Python ML service
    const mlResult = await visualClient.getRecommendation(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      preferredCategory,
      limit,
      description,
    );

    // If successful, enrich with MongoDB product data
    if (mlResult.status === "success") {
      const enriched = await visualClient.enrichResults(mlResult);

      // Log the recommendation
      await visualClient.logRecommendation(
        userId,
        enriched,
        preferredCategory,
        Math.round(req.file.size / 1024)
      );

      return res.json(enriched);
    }

    // Log rejection/error
    await visualClient.logRecommendation(
      userId,
      mlResult,
      preferredCategory,
      Math.round(req.file.size / 1024)
    );

    return res.status(400).json(mlResult);
  } catch (error) {
    console.error("[VisualController] Recommend error:", error.message);
    return res.status(500).json({
      status: "error",
      reason: "Internal server error during visual recommendation.",
    });
  }
};

/**
 * GET /api/visual/categories
 * Get list of supported dress categories
 */
exports.getCategories = async (req, res) => {
  try {
    const data = await visualClient.getCategories();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/visual/ml-health
 * Check ML service health status
 */
exports.getMLHealth = async (req, res) => {
  try {
    const health = await visualClient.getMLHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/visual/dataset-status
 * Get dataset status (how many images per category)
 */
exports.getDatasetStatus = async (req, res) => {
  try {
    const status = await visualClient.getDatasetStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/visual/index-stats
 * Get embedding index statistics
 */
exports.getIndexStats = async (req, res) => {
  try {
    const stats = await visualClient.getIndexStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/visual/history/:user_id
 * Get visual recommendation history for a user
 */
exports.getHistory = async (req, res) => {
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const history = await VisualRecommendation.find({ user_id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/visual/seed-demo
 * Seed demo products into MongoDB for testing
 */
exports.seedDemo = async (req, res) => {
  try {
    const result = await visualClient.seedDemoProducts();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
