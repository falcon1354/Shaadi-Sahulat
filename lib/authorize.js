/**
 * Authorization helpers built on the verified identity from lib/auth.js.
 *
 *   requireRoles("seller", "admin")                 → 401 without identity, 403 wrong role
 *   requireSelfParam("buyer_id", { role: "buyer" }) → the URL id must be the caller's own id
 *
 * The ONLY trusted identity is req.user (set by authenticate from a verified JWT).
 * URL / query / body ids are compared against it — never used as proof of identity.
 */

const { authenticate } = require("./auth");

const FORBIDDEN = { success: false, code: "FORBIDDEN", error: "You do not have access to this resource." };

function forbid(res, error) {
  return res.status(403).json(error ? { ...FORBIDDEN, error } : FORBIDDEN);
}

/** Allow any of the given roles (after authentication). */
function requireRoles(...roles) {
  return [
    authenticate,
    (req, res, next) => (roles.includes(req.user.role) ? next() : forbid(res)),
  ];
}

/**
 * The route parameter `param` must equal req.user.id.
 * @param {string} param   route param holding the owner id (e.g. "buyer_id")
 * @param {object} opts
 * @param {string|string[]} [opts.role]  role(s) allowed to act on their OWN id
 * @param {boolean} [opts.allowAdmin]    admins may access any id (read-only oversight routes)
 */
function requireSelfParam(param, { role, allowAdmin = false } = {}) {
  const roles = role ? [].concat(role) : null;
  return [
    authenticate,
    (req, res, next) => {
      if (allowAdmin && req.user.role === "admin") return next();
      if (roles && !roles.includes(req.user.role)) return forbid(res);
      if (String(req.params[param] ?? "") !== String(req.user.id)) return forbid(res);
      next();
    },
  ];
}

/** True if `candidate` (from query/body) is absent or equal to the caller's id. */
function sameOrAbsent(candidate, id) {
  return candidate === undefined || candidate === null || candidate === "" || String(candidate) === String(id);
}

/**
 * Handler for a REMOVED endpoint (Phase 2I): answers 410 Gone and names the
 * replacement. Never authenticates anything and never touches the database.
 */
function endpointRemoved(replacement) {
  return (req, res) => res.status(410).json({
    success: false,
    code: "ENDPOINT_REMOVED",
    error: `This endpoint has been removed. Use ${replacement}.`,
  });
}

module.exports = { FORBIDDEN, forbid, requireRoles, requireSelfParam, sameOrAbsent, endpointRemoved };
