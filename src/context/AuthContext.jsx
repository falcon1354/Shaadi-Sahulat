/**
 * AuthProvider — JWT session model.
 *
 *   status: "loading" → "authenticated" | "anonymous"
 *   user:   { role, id, name, email, email_verified, profile }   (server-verified via /api/auth/*)
 *
 * On start-up the session is restored ONLY through POST /api/auth/refresh (HttpOnly
 * cookie) + GET /api/auth/me. Legacy ss_buyer / ss_seller / ss_admin / ss_active_role
 * keys are deleted without being read. The access token is held in memory by
 * src/api/http.js — never in storage.
 *
 * Compatibility: `buyer`, `seller`, `admin`, loginBuyer/loginSeller/loginAdmin and
 * logoutBuyer/logoutSeller/logoutAdmin are still exposed for existing components.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getFullBuyerData } from "../api/buyerApi";
import { purgeLegacyAuthStorage } from "../auth/authStorage";
import { createSessionStore } from "../auth/sessionStore";

// Runs once at module load — before any component renders or reads storage.
purgeLegacyAuthStorage();

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

/** Buyer convenience caches (same behaviour as the pre-JWT loginBuyer). */
function warmBuyerCaches(profile) {
  const id = profile?.buyer_id;
  if (!id) return;
  try {
    if (Array.isArray(profile.wishlist_items)) {
      localStorage.setItem(`ss_wishlist_${id}`, JSON.stringify(profile.wishlist_items));
    }
    if (Array.isArray(profile.recently_viewed_items)) {
      localStorage.setItem(`ss_recently_viewed_${id}`, JSON.stringify(profile.recently_viewed_items));
    }
    if (Array.isArray(profile.cart_items) && profile.cart_items.length > 0) {
      const existing = localStorage.getItem(`ss_cart_${id}`);
      if (!existing || existing === "[]") {
        localStorage.setItem(`ss_cart_${id}`, JSON.stringify(profile.cart_items));
      }
    }
    if (!localStorage.getItem(`ss_dowry_${id}`)) {
      getFullBuyerData(id).then((res) => {
        if (!res?.success || !res.dowry_estimation) return;
        const est = res.dowry_estimation;
        const budgets = est.category_budgets;
        if (!budgets || !Object.keys(budgets).length) return;
        const total = Object.values(budgets).reduce((s, v) => s + (v?.estimated || 0), 0);
        const originalIds = Array.isArray(est.original_category_ids) && est.original_category_ids.length
          ? est.original_category_ids
          : Object.keys(budgets).filter((k) => (budgets[k]?.estimated || 0) > 0);
        const payload = JSON.stringify({
          estimation_id: est._id,
          total_budget: total || est.total_recommended_budget,
          category_budgets: budgets,
          original_category_ids: originalIds,
          saved_at: est.updated_at || est.created_at || new Date().toISOString(),
        });
        localStorage.setItem(`ss_dowry_${id}`, payload);
        localStorage.setItem("ss_dowry_latest", payload);
      }).catch(() => {});
    }
  } catch { /* storage unavailable — caches are optional */ }
}

export function AuthProvider({ children }) {
  // One store per provider; its logic lives in src/auth/sessionStore.js (unit-tested).
  const [store] = useState(() => createSessionStore({ onBuyerSignedIn: warmBuyerCaches }));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  const value = useMemo(() => {
    const user = state.user;
    const role = user?.role || null;
    const profile = user?.profile || null;
    return {
      status: state.status,
      loading: state.status === "loading",
      isAuthenticated: state.status === "authenticated",
      user,
      role,
      notice: state.notice,
      clearNotice: store.clearNotice,
      // legacy shapes used across the app (derived from the verified profile only)
      buyer: role === "buyer" ? { ...profile, buyer_id: user.id, name: user.name, email: user.email } : null,
      seller: role === "seller" ? { ...profile, seller_id: user.id, name: user.name, email: user.email } : null,
      admin: role === "admin" ? { ...profile, admin_id: user.id, name: user.name, email: user.email } : null,
      login: store.login,
      register: store.register,
      verifyRegistration: store.verifyRegistration,
      resendRegistrationOtp: store.resendRegistrationOtp,
      logout: store.logout,
      logoutAll: store.logoutAll,
      changePassword: store.changePassword,
      refreshUser: store.refreshUser,
      forgotPassword: store.forgotPassword,
      resetPassword: store.resetPassword,
      verifyEmail: store.verifyEmail,
      resendVerification: store.resendVerification,
      loginBuyer: (email, password) => store.login("buyer", email, password),
      loginSeller: (email, password) => store.login("seller", email, password),
      loginAdmin: (email, password) => store.login("admin", email, password),
      logoutBuyer: store.logout,
      logoutSeller: store.logout,
      logoutAdmin: store.logout,
    };
  }, [state, store]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
