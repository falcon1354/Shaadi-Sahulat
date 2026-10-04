/**
 * Framework-free session store behind AuthProvider (unit-testable without React).
 *
 *   state: { status: "loading" | "authenticated" | "anonymous", user, notice }
 *   user:  { role, id, name, email, email_verified, profile }   — from /api/auth/* responses only
 *
 * The access token is held by src/api/http.js (memory only). The refresh token is
 * the HttpOnly `ss_rt` cookie. Nothing here reads identity from localStorage.
 */

import {
  authFetch, authPost, authErrorMessage, clearAccessToken, fetchMe, onAuthEvent,
  refreshSession, setAccessToken,
} from "../api/http";
import { clearUserCaches } from "./authStorage";

const CSRF_HEADER = { "X-Requested-With": "ShaadiSahulat" };

export function normalizeUser(user, profile) {
  if (!user?.role || !user?.id) return null;
  return {
    role: user.role,
    id: user.id,
    name: user.name || profile?.name || "",
    email: user.email || profile?.email || "",
    email_verified: user.email_verified !== false,
    profile: profile || user.profile || {},
  };
}

/**
 * @param {object} deps
 * @param {(profile) => void} [deps.onBuyerSignedIn]  cache warming hook (buyers)
 * @param {() => BroadcastChannel|null} [deps.channelFactory]
 */
export function createSessionStore({ onBuyerSignedIn = () => {}, channelFactory = defaultChannel } = {}) {
  let state = { status: "loading", user: null, notice: "" };
  const subscribers = new Set();
  let channel = null;
  let offAuthEvents = null;

  const getState = () => state;
  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...subscribers]) fn(state);
  };

  const broadcast = (type) => { try { channel?.postMessage({ type }); } catch { /* ignore */ } };

  function establish(user, notice) {
    if (!user) {
      clearAccessToken();
      set({ status: "anonymous", user: null, ...(notice !== undefined ? { notice } : {}) });
      return null;
    }
    if (user.role === "buyer") {
      try { onBuyerSignedIn(user.profile); } catch { /* caches are optional */ }
    }
    set({ status: "authenticated", user, notice: "" });
    return user;
  }

  function endLocalSession({ notice, broadcastLogout = true } = {}) {
    const current = state.user;
    clearAccessToken();
    clearUserCaches(current);
    set({ status: "anonymous", user: null, notice: notice ?? state.notice });
    if (broadcastLogout) broadcast("logout");
  }

  /** Restore the session from the HttpOnly refresh cookie (never from storage). */
  async function restore() {
    const refreshed = await refreshSession();
    if (!refreshed) return establish(null);
    const me = await fetchMe();
    return establish(me ? normalizeUser(me, me.profile) : null);
  }

  function completeLogin(body) {
    setAccessToken(body.access_token);
    const user = establish(normalizeUser(body.user, body.profile));
    broadcast("login");
    return user;
  }

  async function login(portal, email, password) {
    try {
      const r = await authPost("/login", { portal, email, password });
      if (!r.ok || !r.body?.access_token) return { ok: false, error: authErrorMessage(r.status, r.body) };
      return { ok: true, user: completeLogin(r.body) };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  /**
   * Step 1 of OTP-first sign-up: no account exists yet. Resolves to
   * { ok: true, pending: { portal, email, registrationToken, otpExpiresIn, resendAfter, message } }.
   * The registration token is kept only in memory by the caller (never stored).
   */
  async function register(portal, data) {
    if (portal !== "buyer" && portal !== "seller") return { ok: false, error: "Registration is not available." };
    try {
      const r = await authPost(`/${portal}/register`, data);
      if (!r.ok || !r.body?.verification_required || !r.body?.registration_token) {
        return { ok: false, error: authErrorMessage(r.status, r.body) };
      }
      return {
        ok: true,
        pending: {
          portal,
          email: r.body.email,
          registrationToken: r.body.registration_token,
          otpExpiresIn: r.body.otp_expires_in,
          resendAfter: r.body.resend_after,
          message: r.body.message || "",
        },
      };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  /** Step 2: verify the emailed 6-digit code → the account is created and signed in. */
  async function verifyRegistration(pending, otp) {
    try {
      const r = await authPost("/register/verify", {
        portal: pending.portal, email: pending.email, otp, registration_token: pending.registrationToken,
      });
      if (!r.ok || !r.body?.access_token) {
        return {
          ok: false,
          code: r.body?.code || "",
          error: authErrorMessage(r.status, r.body),
          attemptsRemaining: r.body?.attempts_remaining,
        };
      }
      return { ok: true, user: completeLogin(r.body) };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  /** Request a new code (the previous one stops working). */
  async function resendRegistrationOtp(pending) {
    try {
      const r = await authPost("/register/resend", {
        portal: pending.portal, email: pending.email, registration_token: pending.registrationToken,
      });
      if (!r.ok) return { ok: false, code: r.body?.code || "", error: authErrorMessage(r.status, r.body), retryAfter: r.body?.retry_after };
      return { ok: true, resendAfter: r.body?.resend_after, message: r.body?.message || "" };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  async function logout() {
    try { await authPost("/logout", {}, { bearer: true }); } catch { /* local logout still happens */ }
    endLocalSession();
  }

  async function logoutAll() {
    try {
      await authFetch("/api/auth/logout-all", { method: "POST", credentials: "same-origin", headers: CSRF_HEADER });
    } catch { /* local logout still happens */ }
    endLocalSession();
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...CSRF_HEADER },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      if (!res.ok) return { ok: false, error: authErrorMessage(res.status, body) };
      // token_version changed server-side + all sessions revoked → require a fresh login.
      endLocalSession({ notice: "Password changed. Please sign in again with your new password." });
      return { ok: true };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  // ── Password reset + email verification (Phase 2H) ──────────────────────
  // One-time tokens are passed straight through to the API in the request body;
  // they are never stored (no localStorage/sessionStorage) and never logged.

  /** Always resolves to the same generic message (the API does not reveal accounts). */
  async function forgotPassword(email) {
    try {
      const r = await authPost("/forgot-password", { email });
      if (!r.ok) return { ok: false, error: authErrorMessage(r.status, r.body) };
      return { ok: true, message: r.body?.message || "" };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  /**
   * Completes a reset. The server revokes every session (and clears this browser's
   * refresh cookie), so any local session ends too. No auto-login.
   * @returns {{ok, error?, expired?, invalid?}}
   */
  async function resetPassword(token, password) {
    try {
      const r = await authPost("/reset-password", { token, password });
      if (!r.ok) {
        return {
          ok: false,
          error: authErrorMessage(r.status, r.body),
          expired: r.body?.code === "TOKEN_EXPIRED",
          invalid: r.body?.code === "INVALID_OR_EXPIRED_TOKEN",
        };
      }
      const notice = "Your password has been reset. Please sign in with your new password.";
      if (state.status === "authenticated") endLocalSession({ notice });
      else { clearAccessToken(); set({ notice }); }
      return { ok: true };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  /** @returns {{ok, status: "verified"|"already_verified"|"expired"|"invalid"|"error", message}} */
  async function verifyEmail(token) {
    try {
      const r = await authPost("/verify-email", { token });
      if (r.ok) {
        if (state.status === "authenticated") { try { await refreshUser(); } catch { /* ignore */ } }
        return { ok: true, status: r.body?.status === "already_verified" ? "already_verified" : "verified", message: r.body?.message || "" };
      }
      const code = r.body?.code;
      const status = code === "TOKEN_EXPIRED" ? "expired" : code === "INVALID_OR_EXPIRED_TOKEN" ? "invalid" : "error";
      return { ok: false, status, message: authErrorMessage(r.status, r.body) };
    } catch {
      return { ok: false, status: "error", message: authErrorMessage(0) };
    }
  }

  /** Signed in → resend for the current account (Bearer); otherwise by email. Generic answer. */
  async function resendVerification(email) {
    try {
      let status; let body = null;
      if (state.status === "authenticated") {
        const res = await authFetch("/api/auth/resend-verification", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", ...CSRF_HEADER },
          body: "{}",
        });
        status = res.status;
        try { body = await res.json(); } catch { /* ignore */ }
      } else {
        const r = await authPost("/resend-verification", { email });
        status = r.status; body = r.body;
      }
      if (status < 200 || status >= 300) return { ok: false, error: authErrorMessage(status, body) };
      return { ok: true, message: body?.message || "" };
    } catch {
      return { ok: false, error: authErrorMessage(0) };
    }
  }

  async function refreshUser() {
    const me = await fetchMe();
    if (me) establish(normalizeUser(me, me.profile));
  }

  const clearNotice = () => { if (state.notice) set({ notice: "" }); };

  /** Wire up session-expiry + cross-tab sync and restore the session. */
  function start() {
    offAuthEvents = onAuthEvent((evt) => {
      if (evt.type === "session-expired" && state.status === "authenticated") {
        endLocalSession({ notice: "Your session has expired. Please sign in again.", broadcastLogout: false });
      }
    });
    channel = channelFactory();
    if (channel) {
      channel.onmessage = (e) => {
        if (e?.data?.type === "logout") endLocalSession({ broadcastLogout: false });
        if (e?.data?.type === "login") restore();
      };
    }
    return restore();
  }

  function stop() {
    try { offAuthEvents?.(); } catch { /* ignore */ }
    try { channel?.close(); } catch { /* ignore */ }
    offAuthEvents = null;
    channel = null;
  }

  return {
    getState, subscribe, start, stop, restore,
    login, register, verifyRegistration, resendRegistrationOtp, logout, logoutAll, changePassword, refreshUser, clearNotice,
    forgotPassword, resetPassword, verifyEmail, resendVerification,
  };
}

function defaultChannel() {
  try { return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ss_auth") : null; }
  catch { return null; }
}
