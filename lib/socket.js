/**
 * Socket.io server — real-time notifications between buyer ↔ seller ↔ admin.
 *
 * v3.2.0 FIXES (vs v3.1.0):
 *   - Admin now joins THREE rooms on connect:
 *       1. admin:<admin_id>      — personal room (rarely used)
 *       2. admin:admin            — literal room, matches notify.js which always
 *                                   pushes with recipient_id="admin"
 *       3. admins                 — global admin broadcast room
 *     Previously admin only joined (1) + (3), so notifications emitted to
 *     `admin:admin` (which is what notify.js sends) never reached the socket.
 *   - Added explicit `connect`, `disconnect`, `error` logging so the user
 *     can see in the server console exactly which role:id is connecting.
 *   - Seller connection is now logged the same way as buyer/admin — the
 *     previous code silently joined the seller room without surfacing any
 *     log line, which made debugging "seller can't connect" impossible.
 *   - New `getStatus()` helper that returns the current connected-client
 *     map; exposed via GET /api/socket/status for diagnostics.
 *
 * Design:
 *   - One Node-side io server (attached to the same Express HTTP server).
 *   - Clients connect with auth: { token: <access JWT> } and join a personal
 *     room named `role:id` taken from the VERIFIED token (e.g. "buyer:BUY-1234",
 *     "seller:SEL-5678"). Admin also joins `admins` and the literal "admin:admin".
 *   - Backend code calls `emitToUser(role, id, eventName, payload)` from
 *     anywhere in the codebase to push a real-time event to that user.
 *   - Dispute chat uses a per-dispute room `dispute:<dispute_id>` so buyer,
 *     seller, and admin all receive new messages instantly.
 *
 * Auth model (Phase 2G): same verified JWT as the HTTP API.
 *   - handshake.auth.token is verified by lib/auth.verifyAndResolveToken
 *     (signature/iss/aud/exp + token_version + disabled check) → socket.user.
 *   - handshake.query role/id are never used. Sockets are dropped when the
 *     access token expires or the account's sessions are revoked.
 *   - dispute:join / dispute:typing require dispute participation
 *     (lib/disputeAccess — same rule as routes/disputes.js).
 */
const { isDisputeParticipant } = require("./disputeAccess");

let io = null;

/**
 * Initialise Socket.io and attach it to the given HTTP server.
 * Must be called exactly once during server bootstrap.
 */
function initSocket(httpServer) {
  const { Server } = require("socket.io");
  const { getAuthConfig } = require("./tokens");
  const configuredOrigin = (getAuthConfig().frontendOrigin || "").replace(/\/$/, "");
  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const clean = origin.replace(/\/$/, "");
    if (configuredOrigin && clean === configuredOrigin) return true;
    if (process.env.NODE_ENV !== "production") {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return true;
    }
    return false;
  };

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, origin || true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, isAllowedOrigin(origin));
    },
    path: "/socket.io/",
    // Allow long-poll fallback when websocket is blocked (corporate networks,
    // weak networks). Websocket is still preferred when available.
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 10000,
  });

  // ── Connection middleware: verified JWT only ──────────────────────────
  // Identity comes ONLY from handshake.auth.token, verified by the same
  // function Express uses. handshake.query (role/id) is ignored entirely.
  io.use(async (socket, next) => {
    try {
      const { verifyAndResolveToken } = require("./auth");
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) return next(socketAuthError("AUTH_REQUIRED"));
      const verified = await verifyAndResolveToken(token);
      if (!verified.ok) return next(socketAuthError(verified.code));
      const { role, id, name, email, sid } = verified.user;
      socket.user = { role, id, name, email, sid };
      socket.data.tokenExp = verified.payload.exp;
      socket.data.disputes = new Set(); // dispute rooms this socket is authorized for
      next();
    } catch (err) {
      console.error("[socket] auth middleware error:", err.message);
      next(socketAuthError("AUTH_UNAVAILABLE"));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { role, id } = socket.user;
    const room = `${role}:${id}`;
    socket.join(room);

    // Admins also join the shared admin rooms (notify.js pushes admin
    // notifications with recipient_id="admin").
    if (role === "admin") {
      socket.join("admins");
      socket.join("admin:admin");
    }

    // Access tokens are short-lived: drop the socket when its token expires so
    // it must reconnect with a fresh token (re-checking token_version and the
    // account). The client refreshes via the HttpOnly cookie and reconnects.
    const msLeft = Math.max(0, socket.data.tokenExp * 1000 - Date.now());
    const expiryTimer = setTimeout(() => {
      socket.emit("auth:expired");
      socket.disconnect(true);
    }, msLeft);

    console.log(
      `[socket] ✅ CONNECTED  ${room}  (sid=${socket.id})` +
      (role === "admin" ? "  [also in: admins, admin:admin]" : "")
    );

    // Subscribe to a dispute room. Only the dispute's buyer, its seller or an
    // admin may join (same rule as the HTTP routes). Unknown and forbidden
    // disputes get the same answer so existence is not leaked.
    socket.on("dispute:join", async (disputeId, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        if (typeof disputeId !== "string" || !disputeId || disputeId.length > 100) {
          return reply({ ok: false, error: "INVALID_DISPUTE" });
        }
        const Dispute = require("../models/Dispute");
        const dispute = await Dispute.findOne({ dispute_id: disputeId })
          .select("dispute_id buyer_id seller_id").lean();
        if (!dispute || !isDisputeParticipant(dispute, socket.user)) {
          socket.emit("dispute:error", { dispute_id: disputeId, error: "FORBIDDEN" });
          return reply({ ok: false, error: "FORBIDDEN" });
        }
        socket.data.disputes.add(disputeId);
        socket.join(`dispute:${disputeId}`);
        console.log(`[socket] 🚪 ${room} joined dispute:${disputeId}`);
        reply({ ok: true });
      } catch (err) {
        console.error("[socket] dispute:join error:", err.message);
        reply({ ok: false, error: "UNAVAILABLE" });
      }
    });

    socket.on("dispute:leave", (disputeId) => {
      if (typeof disputeId !== "string") return;
      socket.data.disputes.delete(disputeId);
      socket.leave(`dispute:${disputeId}`);
      console.log(`[socket] 🚪 ${room} left dispute:${disputeId}`);
    });

    // Typing indicator: only for disputes this socket was authorized to join;
    // the displayed name is the verified account name, never client input.
    socket.on("dispute:typing", (payload) => {
      const disputeId = payload && typeof payload === "object" ? payload.disputeId : undefined;
      if (typeof disputeId !== "string" || !socket.data.disputes.has(disputeId)) return;
      socket.to(`dispute:${disputeId}`).emit("dispute:typing", { name: socket.user.name || role, role });
    });

    // Ping for diagnostics — frontend can call socket.emit('ping') to
    // verify the round-trip works.
    socket.on("ping", (cb) => {
      if (typeof cb === "function") cb({ ok: true, t: Date.now() });
    });

    socket.on("disconnect", (reason) => {
      clearTimeout(expiryTimer);
      console.log(`[socket] ❌ DISCONNECTED ${room}  (${reason})`);
    });

    socket.on("error", (err) => {
      console.error(`[socket] ⚠ ERROR on ${room}:`, err?.message || err);
    });
  });

  console.log(`[socket] Socket.io server initialised (path=/socket.io/, origin=${configuredOrigin || 'all-local'}, JWT auth)`);
  return io;
}

/** Connect error carrying a machine-readable code (client reads err.data.code). */
function socketAuthError(code) {
  const err = new Error("unauthorized");
  err.data = { code };
  return err;
}

/**
 * Disconnect every live socket of one account (e.g. after logout-all or a
 * password change) so revoked sessions cannot keep receiving events.
 */
function disconnectUser(role, id) {
  if (!io) return;
  try { io.in(`${role}:${id}`).disconnectSockets(true); } catch (e) { /* noop */ }
}

/**
 * Push a real-time event to a specific user (role + id).
 * Falls back silently if the user is not currently connected (the
 * notification is still persisted in MongoDB by notify.js so they will
 * see it next time they fetch /api/notifications).
 *
 * v3.2: When role === "admin", we emit to BOTH "admin:admin" (literal,
 *       which is what notify.js uses as recipient_id) and "admin:<id>"
 *       (the personal room). This covers both calling conventions.
 *
 * @param {string} role    "buyer" | "seller" | "admin"
 * @param {string} id      user id (or "admin")
 * @param {string} event   socket event name
 * @param {object} payload any JSON-serialisable object
 */
function emitToUser(role, id, event, payload) {
  if (!io) return; // socket not initialised (e.g. during tests)
  try {
    const targets = [`${role}:${id}`];
    // v3.2: cover the admin literal-room alias so the notification
    // always lands even if the caller passed the admin's actual admin_id
    // OR the literal string "admin".
    if (role === "admin" && id !== "admin") {
      targets.push("admin:admin");
    }
    for (const t of targets) io.to(t).emit(event, payload);
  } catch (err) {
    console.error("[socket] emitToUser error:", err.message);
  }
}

/**
 * Broadcast to every admin (admins room + admin:admin literal room).
 * v3.2: emit to BOTH rooms so we catch every admin socket regardless of
 *       which room it joined.
 */
function emitToAdmins(event, payload) {
  if (!io) return;
  try {
    io.to("admins").emit(event, payload);
    io.to("admin:admin").emit(event, payload);
  } catch (e) { /* noop */ }
}

/**
 * Broadcast a chat message to every member of a dispute room.
 * Used by /api/disputes/:id/messages after a row is persisted.
 */
function emitDisputeMessage(disputeId, messageDoc) {
  if (!io) return;
  try { io.to(`dispute:${disputeId}`).emit("dispute:message", messageDoc); } catch (e) { /* noop */ }
}

/**
 * v3.2: Diagnostic helper — returns the count of connected sockets per
 * role and the list of dispute rooms currently occupied. Exposed via
 * GET /api/socket/status so the user can verify who's connected without
 * having to dig through server logs.
 */
function getStatus() {
  if (!io) return { initialised: false };
  const sockets = io.sockets.sockets;
  const byRole = { buyer: 0, seller: 0, admin: 0 };
  const rooms = [];
  for (const [, s] of sockets) {
    const r0 = s.user?.role;
    if (r0 && byRole[r0] !== undefined) byRole[r0]++;
    for (const r of s.rooms) {
      if (typeof r === "string" && r.startsWith("dispute:")) rooms.push(r);
    }
  }
  return {
    initialised: true,
    total_sockets: sockets.size,
    by_role: byRole,
    active_dispute_rooms: [...new Set(rooms)],
  };
}

function getIO() { return io; }

module.exports = {
  initSocket,
  disconnectUser,
  emitToUser,
  emitToAdmins,
  emitDisputeMessage,
  getStatus,
  getIO,
};
