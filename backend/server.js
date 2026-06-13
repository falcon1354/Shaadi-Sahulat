/**
 * ShaadiSahulat - Backend Server
 * ================================
 * Express server with MongoDB integration.
 *
 * Buyer endpoints:
 *   POST /api/visual/recommend           — Upload image, get similar dresses
 *   GET  /api/visual/categories          — List supported categories
 *   GET  /api/visual/ml-health           — Check ML service health
 *   GET  /api/visual/dataset-status      — Dataset image counts
 *   GET  /api/visual/index-stats         — Embedding index statistics
 *   GET  /api/visual/history/:user_id    — Recommendation history
 *
 * Seller endpoints:
 *   POST /api/seller/register            — Register seller account
 *   GET  /api/seller/profile/:id         — Get seller profile
 *   GET  /api/seller/by-email            — Look up by email
 *   POST /api/seller/product             — Upload product (up to 5 images)
 *   GET  /api/seller/products            — List products (paginated)
 *   GET  /api/seller/product/:id         — Get single product
 *   PUT  /api/seller/product/:id         — Update product metadata
 *   DELETE /api/seller/product/:id       — Delete product + files
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const visualRoutes = require("./routes/visual");
const sellerRoutes = require("./routes/seller");
const dowryRoutes  = require("./routes/dowry");
const buyerRoutes  = require("./routes/buyer");
const adminRoutes      = require("./routes/admin");
const categoriesRoutes = require("./routes/categories");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/visual",  visualRoutes);
app.use("/api/seller",  sellerRoutes);
app.use("/api/dowry",   dowryRoutes);
app.use("/api/buyer",   buyerRoutes);
app.use("/api/admin",      adminRoutes);
app.use("/api/categories", categoriesRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "shaadi-sahulat-backend",
    modules: ["visual-recommendation"],
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get("/", (req, res) => {
  res.json({
    message: "ShaadiSahulat API",
    version: "2.0.0",
    modules: {
      buyer: {
        recommend:     "POST /api/visual/recommend",
        categories:    "GET  /api/visual/categories",
        mlHealth:      "GET  /api/visual/ml-health",
        datasetStatus: "GET  /api/visual/dataset-status",
        indexStats:    "GET  /api/visual/index-stats",
        history:       "GET  /api/visual/history/:user_id",
      },
      seller: {
        register:      "POST /api/seller/register",
        profile:       "GET  /api/seller/profile/:seller_id",
        byEmail:       "GET  /api/seller/by-email?email=",
        uploadProduct: "POST /api/seller/product",
        listProducts:  "GET  /api/seller/products",
        getProduct:    "GET  /api/seller/product/:product_id",
        updateProduct: "PUT  /api/seller/product/:product_id",
        deleteProduct: "DELETE /api/seller/product/:product_id",
      },
    },
  });
});

// ── Error handling ─────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[Server Error]", err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ── Start server ───────────────────────────────────────────────────────────
const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[Server] ShaadiSahulat Backend running on port ${PORT}`);
      console.log(`[Server] Visual ML Service : ${process.env.VISUAL_ML_URL || "http://localhost:5002"}`);
      console.log(`[Server] Seller API docs   : http://localhost:${PORT}/api/seller`);
      console.log(`[Server] API docs           : http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
};

start();
