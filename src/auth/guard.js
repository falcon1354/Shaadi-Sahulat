/**
 * Pure route-guard decisions (no React) so they can be unit-tested.
 *
 * The ONLY input is the server-verified auth state from AuthProvider.
 * URL query parameters (?as=...), sessionStorage and localStorage are never consulted.
 */

export const ROLES = ["buyer", "seller", "admin"];

export const ROLE_HOME = {
  buyer: "/buyer/dashboard",
  seller: "/seller/dashboard",
  admin: "/admin/dashboard",
};

export const ROLE_LOGIN = {
  buyer: "/buyer/login",
  seller: "/seller/login",
  admin: "/admin/login",
};

/**
 * @param {{status: "loading"|"authenticated"|"anonymous", user?: {role: string}}} auth
 * @param {"buyer"|"seller"|"admin"} requiredRole
 * @returns {{type: "loading"} | {type: "allow"} | {type: "redirect", to: string, reason: string}}
 */
export function guardDecision(auth, requiredRole) {
  if (!auth || auth.status === "loading") return { type: "loading" };
  if (auth.status !== "authenticated" || !auth.user || !ROLES.includes(auth.user.role)) {
    return { type: "redirect", to: ROLE_LOGIN[requiredRole] || "/", reason: "anonymous" };
  }
  if (auth.user.role !== requiredRole) {
    return { type: "redirect", to: ROLE_HOME[auth.user.role] || "/", reason: "wrong-role" };
  }
  return { type: "allow" };
}

/**
 * Where to go after a successful login: back to the originally requested page
 * only if it belongs to the signed-in role; otherwise the role's dashboard.
 */
export function postLoginPath(role, from) {
  const home = ROLE_HOME[role] || "/";
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return home;
  const path = from.split("?")[0];
  if (path.startsWith(`/${role}/`) && !path.endsWith("/login")) return from;
  if (role === "buyer" && path.startsWith("/bnpl/")) return from;
  return home;
}
