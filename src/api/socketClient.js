/**
 * Authenticated Socket.IO client (framework-free, unit-testable).
 *
 *   • Authenticates with the memory-only access JWT via `auth: { token }` —
 *     evaluated on EVERY (re)connect, so reconnects always use the current token.
 *     No role/id is ever sent: the server derives identity from the token.
 *   • Auth rejected (expired/invalid/revoked) or dropped by the server (token
 *     expiry / session revocation): renew the token ONCE through the existing
 *     refresh flow (HttpOnly cookie), then reconnect. If the session cannot be
 *     renewed, report session-expired to AuthProvider — never retry forever with
 *     a stale token.
 */

import { io } from "socket.io-client";
import { getAccessToken, refreshSession, reportSessionExpired } from "./http";

// Server-side auth rejection codes (lib/auth.verifyAndResolveToken + lib/socket.js).
export const SOCKET_AUTH_ERRORS = new Set([
  "AUTH_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_REVOKED", "PROFILE_NOT_FOUND", "ACCOUNT_DISABLED",
]);

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.maxAuthRecoveries=2]  consecutive refresh+reconnect attempts before giving up
 * @param {object} [opts.ioOptions]            extra socket.io-client options (tests)
 * @returns {{ socket: import("socket.io-client").Socket, dispose: () => void }}
 */
export function createAuthenticatedSocket(url, { maxAuthRecoveries = 2, ioOptions = {} } = {}) {
  let disposed = false;
  let recovering = false;
  let authFailures = 0;

  const socket = io(url, {
    path: "/socket.io/",
    auth: (cb) => cb({ token: getAccessToken() || "" }),
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    ...ioOptions,
  });

  const recoverAuth = async () => {
    if (recovering || disposed) return;
    recovering = true;
    try {
      if (authFailures >= maxAuthRecoveries) {
        reportSessionExpired("socket");
        return;
      }
      authFailures += 1;
      const refreshed = await refreshSession();
      if (disposed) return;
      if (!refreshed) {
        reportSessionExpired("socket");
        return;
      }
      socket.connect();
    } finally {
      recovering = false;
    }
  };

  socket.on("connect", () => { authFailures = 0; });

  // Server-initiated disconnects (token expiry / revocation) are not retried by
  // Socket.IO automatically: renew the token first, then reconnect.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") recoverAuth();
  });

  // Middleware rejections are not retried automatically either; only auth codes
  // trigger a refresh (network errors keep Socket.IO's normal back-off).
  socket.on("connect_error", (err) => {
    const code = err?.data?.code;
    if (code && SOCKET_AUTH_ERRORS.has(code)) recoverAuth();
  });

  return {
    socket,
    dispose() {
      disposed = true;
      try { socket.disconnect(); } catch { /* ignore */ }
    },
  };
}
