import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { guardDecision } from "./guard";

/** Neutral full-screen placeholder shown while the session is being verified. */
export function AuthLoading() {
  return (
    <div className="min-h-screen bg-[#FCFBFB] flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-10 h-10 rounded-full border-4 border-[#ECD4A8] border-t-[#a37b3d] animate-spin" />
        <span className="text-sm">Checking your session…</span>
      </div>
    </div>
  );
}

/**
 * Role-aware route guard. Uses ONLY the server-verified AuthProvider state:
 *   loading   → placeholder (protected content is never rendered)
 *   anonymous → that role's login page (remembers where the user was going)
 *   wrong role→ the signed-in user's own dashboard
 */
export default function RequireRole({ role }) {
  const auth = useAuth();
  const location = useLocation();
  const decision = guardDecision(auth, role);

  if (decision.type === "loading") return <AuthLoading />;
  if (decision.type === "redirect") {
    const state = decision.reason === "anonymous"
      ? { from: `${location.pathname}${location.search}` }
      : undefined;
    return <Navigate to={decision.to} replace state={state} />;
  }
  return <Outlet />;
}
