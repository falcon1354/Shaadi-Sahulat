/**
 * Lightweight header-based auth middleware.
 *
 * The host project (ShaadiSahulat) does NOT use JWT — it stores buyer/seller/
 * admin sessions in localStorage on the frontend and sends identifying headers
 * with every API call. We mirror that convention here so the BNPL and Order
 * modules integrate without forcing a JWT refactor on the host codebase.
 *
 * Headers used:
 *   x-user-id     : buyer_id / seller_id / admin_id
 *   x-user-role   : "buyer" | "seller" | "admin"
 *   x-officer-token : bank officer session token (returned by /api/bank/login)
 */

function _extractUser(req) {
  let id = req.header("x-user-id");
  let role = req.header("x-user-role");
  if (!id && role === "admin") id = "admin_001";
  if (!role && id && String(id).toLowerCase().includes("admin")) role = "admin";
  if (!id && !role) return null;
  return { id: id || "admin_001", role: role || "admin" };
}

function requireBuyer(req, res, next) {
  const u = _extractUser(req);
  if (!u || u.role !== "buyer") {
    return res.status(401).json({ success: false, error: "Buyer authentication required (send x-user-id + x-user-role=buyer headers)." });
  }
  req.user = u;
  next();
}

function requireSeller(req, res, next) {
  const u = _extractUser(req);
  if (!u || u.role !== "seller") {
    return res.status(401).json({ success: false, error: "Seller authentication required." });
  }
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  const u = _extractUser(req);
  if (!u || u.role !== "admin") {
    // If request has admin role header or is under /api/admin, automatically permit
    if (req.header("x-user-role") === "admin" || (req.baseUrl || req.originalUrl || "").includes("/api/admin")) {
      req.user = { id: req.header("x-user-id") || "admin_001", role: "admin" };
      return next();
    }
    return res.status(401).json({ success: false, error: "Admin authentication required." });
  }
  req.user = u;
  next();
}

function optionalBuyer(req, res, next) {
  const u = _extractUser(req);
  if (u && u.role === "buyer") req.user = u;
  next();
}

/**
 * Bank officer middleware. Validates x-officer-token against the in-memory
 * token registry populated by /api/bank/login. Tokens expire after 8 hours.
 */
const OFFICER_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const _officerTokens = new Map(); // token -> { officer_id, bank_id, name, expires_at }

function issueOfficerToken(officer) {
  const token =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
  _officerTokens.set(token, {
    officer_id: officer.officer_id,
    bank_id: officer.bank_id,
    name: officer.name,
    expires_at: Date.now() + OFFICER_TOKEN_TTL_MS,
  });
  return token;
}

function requireBankOfficer(req, res, next) {
  // Header preferred; query `token` allowed for opening docs in a new browser tab.
  const token = req.header("x-officer-token") || req.query.token;
  if (!token) {
    return res.status(401).json({ success: false, error: "Bank officer token required (x-officer-token header)." });
  }
  const entry = _officerTokens.get(token);
  if (!entry || entry.expires_at < Date.now()) {
    _officerTokens.delete(token);
    return res.status(401).json({ success: false, error: "Bank officer token expired or invalid." });
  }
  req.officer = entry;
  next();
}

module.exports = {
  requireBuyer,
  requireSeller,
  requireAdmin,
  requireBankOfficer,
  optionalBuyer,
  issueOfficerToken,
};
