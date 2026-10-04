/**
 * Centralized authenticated HTTP layer.
 *
 *   • The access JWT lives ONLY in this module's memory (never localStorage /
 *     sessionStorage / URL). It is lost on reload and restored via /api/auth/refresh.
 *   • The refresh token lives ONLY in the HttpOnly `ss_rt` cookie. Auth-cookie
 *     requests use RELATIVE /api/auth/* URLs so they go through the Vite proxy and
 *     the browser attaches the cookie (same origin).
 *   • authFetch() is a drop-in replacement for fetch(): it adds
 *     `Authorization: Bearer <token>` and, on a 401, performs ONE shared refresh and
 *     retries the original request ONCE. 403 is returned untouched (never refreshes).
 *   • No x-user-id / x-user-role headers are ever sent.
 */

import axios from "axios";

const AUTH_BASE = "/api/auth";
const CSRF_HEADER = { "X-Requested-With": "ShaadiSahulat" };

let accessToken = null;
let refreshInFlight = null;
const listeners = new Set();

// ── Token (memory only) ─────────────────────────────────────────────────────

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = typeof token === "string" && token ? token : null;
}

export function clearAccessToken() {
  accessToken = null;
}

// ── Events ──────────────────────────────────────────────────────────────────

/** Subscribe to auth events: "session-expired" | "forbidden". Returns an unsubscribe fn. */
export function onAuthEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(type, detail) {
  for (const l of [...listeners]) {
    try { l({ type, ...detail }); } catch { /* listener errors must not break requests */ }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

function withAuthHeader(headers, token) {
  const h = new Headers(headers || {});
  h.delete("x-user-id");
  h.delete("x-user-role");
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

/**
 * Report that the session could not be renewed (e.g. the Socket.IO layer failed
 * to refresh). Uses the same "session-expired" path as authFetch.
 */
export function reportSessionExpired(source = "socket") {
  clearAccessToken();
  emit("session-expired", { url: source });
}

// ── Refresh (single shared request) ─────────────────────────────────────────

/**
 * POST /api/auth/refresh (cookie). Concurrent callers share ONE request.
 * Resolves to the response body on success, or null on failure (token cleared).
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${AUTH_BASE}/refresh`, {
          method: "POST",
          credentials: "same-origin",
          headers: CSRF_HEADER,
        });
        const body = await readJson(res);
        if (res.ok && body?.access_token) {
          setAccessToken(body.access_token);
          return body;
        }
      } catch { /* network error → treated as failed refresh */ }
      clearAccessToken();
      return null;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// ── authFetch ───────────────────────────────────────────────────────────────

/**
 * fetch() replacement with Bearer auth + one refresh-and-retry on 401.
 * Only retries when the request actually carried an access token.
 */
export async function authFetch(input, init = {}) {
  const sentToken = accessToken;
  const res = await fetch(input, { ...init, headers: withAuthHeader(init.headers, sentToken) });

  if (res.status === 403) {
    emit("forbidden", { url: String(input) });
    return res;
  }
  if (res.status !== 401 || !sentToken) return res;

  // Another request may already have refreshed while this one was in flight.
  if (accessToken && accessToken !== sentToken) {
    return fetch(input, { ...init, headers: withAuthHeader(init.headers, accessToken) });
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    emit("session-expired", { url: String(input) });
    return res;
  }
  // Retry exactly once — the retried response is returned as-is (no further refresh).
  return fetch(input, { ...init, headers: withAuthHeader(init.headers, accessToken) });
}

// ── Auth endpoints (cookie-setting; never trigger refresh) ──────────────────

/** POST to /api/auth/<path> through the Vite proxy so the HttpOnly cookie is set/sent. */
export async function authPost(path, body, { bearer = false } = {}) {
  const headers = { "Content-Type": "application/json", ...CSRF_HEADER };
  if (bearer && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, ok: res.ok, body: await readJson(res) };
}

/** GET /api/auth/me with the current access token (one refresh+retry via authFetch). */
export async function fetchMe() {
  const res = await authFetch(`${AUTH_BASE}/me`, { credentials: "same-origin" });
  const body = await readJson(res);
  return res.ok && body?.user ? body.user : null;
}

/** Map a backend auth response to a safe, user-facing message (no raw errors). */
export function authErrorMessage(status, body) {
  const code = body?.code;
  if (status === 429 || code === "RATE_LIMITED") return "Too many attempts. Please try again later.";
  if (code === "INVALID_CREDENTIALS") return "Invalid email or password.";
  if (code === "EMAIL_IN_USE") return "This email is already registered.";
  if (code === "INVALID_CURRENT_PASSWORD") return "Current password is incorrect.";
  if (code === "SAME_PASSWORD") return "New password must be different from the current password.";
  if (code === "TOKEN_EXPIRED") return "This link has expired. Please request a new one.";
  if (code === "INVALID_OR_EXPIRED_TOKEN") return "This link is invalid or has expired. Please request a new one.";
  if (code === "EMAIL_NOT_VERIFIED") return "Please verify your email address before signing in.";
  if (code === "INVALID_OTP") return typeof body?.attempts_remaining === "number"
    ? `That code is incorrect. ${body.attempts_remaining} attempt${body.attempts_remaining === 1 ? "" : "s"} left.`
    : "That code is incorrect. Please check the email and try again.";
  if (code === "OTP_EXPIRED") return "This code has expired. Request a new code.";
  if (code === "TOO_MANY_ATTEMPTS") return "Too many incorrect attempts. Request a new code.";
  if (code === "RESEND_COOLDOWN") return "Please wait a moment before requesting another code.";
  if (code === "SERVICE_UNAVAILABLE") return "We could not create your account right now. Request a new code and try again.";
  if (code === "VALIDATION_ERROR" && typeof body?.error === "string") return body.error;
  if (code === "CSRF_REJECTED") return "Request blocked. Please reload the page and try again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 503) return "Service temporarily unavailable. Please try again.";
  if (status === 0) return "Could not reach the server. Please check your connection.";
  return "Something went wrong. Please try again.";
}

// ── axios instance for helpers that use axios ───────────────────────────────

export const authAxios = axios.create();

authAxios.interceptors.request.use((config) => {
  if (config.headers) {
    delete config.headers["x-user-id"];
    delete config.headers["x-user-role"];
  }
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
    config._sentToken = accessToken;
  }
  return config;
});

authAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error || {};
    if (!response || !config) throw error;
    if (response.status === 403) {
      emit("forbidden", { url: config.url });
      throw error;
    }
    if (response.status !== 401 || !config._sentToken || config._authRetried) throw error;

    config._authRetried = true;
    if (!(accessToken && accessToken !== config._sentToken)) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        emit("session-expired", { url: config.url });
        throw error;
      }
    }
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
    return authAxios(config);
  }
);
