/**
 * ShaadiSahulat - Backend Server
 * ================================
 * Express server with MongoDB integration.
 *
 * Original modules:
 *   /api/visual    — Visual ML recommendation (Flask proxy)
 *   /api/seller    — Seller registration + product CRUD
 *   /api/dowry     — Dowry estimation
 *   /api/buyer     — Buyer registration/login/wishlist/cart
 *   /api/admin     — Admin: sellers, buyers, products, categories
 *   /api/categories
 *
 * NEW (BNPL + Order Processing):
 *   /api/bnpl            — Buyer BNPL applications (eligibility, submit, accept/decline offer)
 *   /api/bank            — Bank officer login + verification workbench (APPROVE/REJECT)
 *   /api/orders          — Order lifecycle: create → ship → deliver → confirm → review
 *   /api/disputes        — Dispute chat room + admin decision
 *   /api/reviews         — Public product/seller reviews + AI rating/generation proxies
 *   /api/notifications   — Buyer/seller/admin notifications
 *
 * NEW (v3.1):
 *   Socket.io           — Real-time notifications + dispute chat between buyer, seller, admin
 *
 * Auth: verified JWT (Authorization: Bearer) → req.user; see lib/auth.js + lib/authorize.js.
 *   x-officer-token  (bank officer only — returned by /api/bank/login)
 */

require("dotenv").config();
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { validateAuthConfig, getAuthConfig } = require("./lib/tokens");
// Adds X-Internal-Secret to Node → visual-ml / ml-service calls (internal origins only).
require("./lib/flaskHttp");

// ── Fail fast on missing/weak auth configuration (names only, never values) ──
const authConfigProblems = validateAuthConfig();
if (authConfigProblems.length) {
  console.error("[Server] Authentication configuration error:");
  for (const p of authConfigProblems) console.error(`  - ${p}`);
  console.error("[Server] Set these in .env (see .env.example) and restart.");
  process.exit(1);
}

const authRoutes       = require("./routes/auth");
const { requireAdmin } = require("./lib/auth");

const visualRoutes     = require("./routes/visual");
const sellerRoutes     = require("./routes/seller");
const dowryRoutes      = require("./routes/dowry");
const buyerRoutes      = require("./routes/buyer");
const adminRoutes      = require("./routes/admin");
const categoriesRoutes = require("./routes/categories");

// NEW: BNPL + Order Processing modules
const bnplRoutes         = require("./routes/bnpl");
const bankRoutes         = require("./routes/bank");
const orderRoutes        = require("./routes/orders");
const disputeRoutes      = require("./routes/disputes");
const reviewRoutes       = require("./routes/reviews");
const notificationRoutes = require("./routes/notifications");
const { router: bannerRoutes, cleanupExpiredBanners } = require("./routes/banners");
const fileRoutes         = require("./routes/files");

// NEW: Socket.io server
const { initSocket, getStatus } = require("./lib/socket");
const { startBnplTimer } = require("./lib/bnplTimer");
const { startDisputeTimer } = require("./lib/disputeTimer");

const app = express();
const PORT = process.env.PORT || 5000;

// Create a single HTTP server that both Express and Socket.io share.
const httpServer = http.createServer(app);

// ── Middleware ──────────────────────────────────────────────────────────────
// Only the configured frontend may call the API from a browser (no wildcard CORS).
// (An allow-list reflects only a matching Origin; any other origin gets no CORS headers.)
app.use(cors({ origin: [getAuthConfig().frontendOrigin.replace(/\/$/, "")] }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
  // Signed private-file links are capabilities: never write their query string to logs.
  const url = req.path.startsWith("/api/files/") ? `${req.path}?<redacted>` : req.url;
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);
  next();
});

// PUBLIC uploads only: each public folder is its own static root, so nothing else
// under Uploads/ is reachable (no traversal into BNPL/Dispute/Order, whatever the case).
// Private files (CNIC / utility bills, dispute evidence, order attachments) are served
// ONLY via short-lived signed links: GET /api/files/private (lib/privateFiles.js).
const PUBLIC_UPLOAD_DIRS = ["Banners", "Categories", "CategoryPlaceholders", "Reviews"];
for (const dir of PUBLIC_UPLOAD_DIRS) {
  app.use(
    `/uploads/${dir}`,
    express.static(path.join(__dirname, "Uploads", dir), {
      fallthrough: false,
      dotfiles: "deny",
      index: false,
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
  );
}
app.use("/uploads", (req, res) => res.status(404).json({ success: false, error: "Not found" }));
// Static errors (missing file, "..", malformed path) → plain 403/404, never a 500 with a stack trace.
app.use("/uploads", (err, req, res, _next) =>
  res.status(err.status === 403 ? 403 : 404).json({ success: false, error: err.status === 403 ? "Forbidden" : "Not found" }));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/visual",        visualRoutes);
app.use("/api/seller",        sellerRoutes);
app.use("/api/dowry",         dowryRoutes);
app.use("/api/buyer",         buyerRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/categories",    categoriesRoutes);

// NEW modules
app.use("/api/bnpl",          bnplRoutes);
app.use("/api/bank",          bankRoutes);
app.use("/api/orders",        orderRoutes);
app.use("/api/disputes",      disputeRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/banners",       bannerRoutes);
app.use("/api/files",         fileRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "shaadi-sahulat-backend",
    version: "3.2.0",
    modules: [
      "visual-recommendation",
      "bnpl",
      "bank",
      "orders",
      "disputes",
      "reviews",
      "notifications",
      "socket.io",
      "ai-reviews",
      "groq-ai",
    ],
    timestamp: new Date().toISOString(),
  });
});

// v3.2: Socket.io diagnostic endpoint — verify which roles are connected
// and which dispute rooms are currently occupied. Useful for debugging
// "seller can't connect" / "admin can't join dispute" issues.
app.get("/api/socket/status", requireAdmin, (req, res) => {
  res.json({ success: true, ...getStatus() });
});

// Root
app.get("/", (req, res) => {
  res.json({
    message: "ShaadiSahulat API",
    version: "3.2.0",
    modules: {
      buyer: {
        recommend:     "POST /api/visual/recommend",
        categories:    "GET  /api/visual/categories",
        register:      "POST /api/auth/buyer/register",
        login:         "POST /api/auth/login  (portal: buyer)",
        cartSync:      "POST /api/buyer/:buyer_id/cart-sync",
        orders:        "GET  /api/orders?buyer_id=",
        createOrder:   "POST /api/orders",
        confirm:       "POST /api/orders/:order_id/buyer-confirm",
        review:        "POST /api/orders/:order_id/review",
        bnplElig:      "GET  /api/bnpl/eligibility?amount=",
        bnplBanks:     "GET  /api/bnpl/banks",
        bnplSubmit:    "POST /api/bnpl/applications  (multipart)",
        bnplList:      "GET  /api/bnpl/applications",
        bnplAccept:    "POST /api/bnpl/applications/:no/accept-offer",
        bnplDecline:   "POST /api/bnpl/applications/:no/decline-offer",
        notifications: "GET  /api/notifications?user_id=&role=buyer",
      },
      seller: {
        register:      "POST /api/auth/seller/register",
        login:         "POST /api/auth/login  (portal: seller)",
        uploadProduct: "POST /api/seller/product",
        orders:        "GET  /api/seller/orders",
        location:      "GET  /api/seller/orders/:package_id/location",
        prepare:       "POST /api/orders/packages/:package_id/preparing",
        ship:          "POST /api/orders/packages/:package_id/shipping",
        deliver:       "POST /api/orders/packages/:package_id/delivered",
        notifications: "GET  /api/notifications?user_id=&role=seller",
      },
      admin: {
        login:         "POST /api/auth/login  (portal: admin; no admin signup)",
        orders:        "GET  /api/admin/orders",
        orderDetail:   "GET  /api/admin/orders/:order_id",
        disputes:      "GET  /api/admin/disputes",
        releasePay:    "POST /api/admin/orders/:order_id/release-payment",
        wallet:        "GET  /api/admin/wallet",
        payouts:       "GET  /api/admin/sellers/:seller_id/payouts",
        bnplApps:      "GET  /api/admin/bnpl/applications",
      },
      bank: {
        login:         "POST /api/bank/login  (credentials from BANK_OFFICER_* in .env)",
        applications:  "GET  /api/bank/applications",
        appDetail:     "GET  /api/bank/applications/:application_no",
        decision:      "POST /api/bank/applications/:application_no/decision",
      },
      public: {
        productReviews: "GET /api/reviews/product/:product_id",
        sellerRating:   "GET /api/reviews/seller/:seller_id",
      },
      ai: {
        suggestRating:  "POST /api/reviews/ai/suggest-rating      (text → 0.5-5 stars)",
        generateReview: "POST /api/reviews/ai/generate-reviews    (rating+length → 3 drafts)",
      },
      socketio: {
        transport: "socket.io  (path /socket.io/)",
        events:   "notification:new, dispute:message, dispute:typing",
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

    // Initialise Socket.io on the same HTTP server.
    initSocket(httpServer);

    // Start BNPL countdown timer (expires APPROVED applications after 3 days)
    startBnplTimer();

    // Dispute SLAs: 7d auto-complete, 48h seller response, 5d admin resolution
    startDisputeTimer();

    // Start banner cleanup timer (removes expired banners every 5 minutes)
    setInterval(cleanupExpiredBanners, 5 * 60 * 1000);
    console.log('[Server] Banner cleanup timer started (every 5 min)');

    // Email: report whether SMTP login works (never prints credentials).
    require("./lib/mailer").verifyTransport().then((r) => {
      const log = r.ok ? console.log : console.error;
      log(`[Server] Email               : ${r.status} — ${r.detail}`);
      for (const w of r.warnings || []) console.warn(`[Server] Email warning       : ${w}`);
    });

    httpServer.listen(PORT, () => {
      console.log(`[Server] ShaadiSahulat Backend running on port ${PORT}`);
      console.log(`[Server] Socket.io           : ws://localhost:${PORT}/socket.io/`);
      console.log(`[Server] Visual ML Service   : ${process.env.VISUAL_ML_URL || "http://localhost:5002"}`);
      console.log(`[Server] Groq AI             : ${process.env.GROQ_API_KEY ? "✓ configured (GROQ_API_KEY set)" : "✗ not configured (will use VADER/template fallback)"}`);
      console.log(`[Server] Auth                : JWT only (legacy endpoints + x-user headers removed)`);
      console.log(`[Server] API docs            : http://localhost:${PORT}/`);
      console.log(`[Server] Socket status       : http://localhost:${PORT}/api/socket/status`);
      console.log(`[Server] BNPL banks          : HBL, MCB  (seed: node seeds/seedBnplBanks.js)`);
      console.log(`[Server] Bank officer login  : ${process.env.BANK_OFFICER_EMAIL && process.env.BANK_OFFICER_PASSWORD_HASH ? "configured (BANK_OFFICER_*)" : "NOT configured (set BANK_OFFICER_EMAIL + BANK_OFFICER_PASSWORD_HASH)"}`);
      console.log(`[Server] Public uploads      : /uploads/{${PUBLIC_UPLOAD_DIRS.join(",")}} · private files via signed /api/files links`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
};

// Started only when run directly (node server.js / npm start); tests import the app without a DB.
if (require.main === module) start();

module.exports = { app, httpServer, PUBLIC_UPLOAD_DIRS };
