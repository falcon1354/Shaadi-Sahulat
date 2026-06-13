/**
 * ShaadiSahulat - Dowry Estimation Module Backend
 * ==================================================
 * Express server with MongoDB integration.
 *
 * Endpoints:
 *   POST /api/dowry/estimate     — Preview estimation (no save)
 *   POST /api/dowry/save         — Estimate + save to DB + add to ML dataset
 *   GET  /api/dowry/history/:id  — Get estimation history for a user
 *   GET  /api/dowry/:id          — Get single estimation
 *   POST /api/dowry/rule-only    — Rule-based only (no ML)
 *   GET  /api/dowry/ml/stats     — ML dataset statistics
 *   POST /api/dowry/ml/init      — Initialize ML service
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const dowryRoutes = require("./routes/dowry");

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
app.use("/api/dowry", dowryRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "shaadi-sahulat-backend",
    module: "dowry-estimation",
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get("/", (req, res) => {
  res.json({
    message: "ShaadiSahulat Dowry Estimation API",
    version: "1.0.0",
    endpoints: {
      estimate: "POST /api/dowry/estimate",
      save: "POST /api/dowry/save",
      history: "GET /api/dowry/history/:user_id",
      getById: "GET /api/dowry/:id",
      ruleOnly: "POST /api/dowry/rule-only",
      mlStats: "GET /api/dowry/ml/stats",
      mlInit: "POST /api/dowry/ml/init",
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
      console.log(`[Server] ML Service expected at: ${process.env.ML_SERVICE_URL || "http://localhost:5001"}`);
      console.log(`[Server] API docs: http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
};

start();
