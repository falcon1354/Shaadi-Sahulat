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
 *   - Clients connect to /socket.io/?role=<role>&id=<id> and join a personal
 *     room named `role:id`  (e.g.  "buyer:BUY-1234",  "seller:SEL-5678",
 *     "admin:admin").  Admin also joins a global `admins` room.
 *   - Backend code calls `emitToUser(role, id, eventName, payload)` from
 *     anywhere in the codebase to push a real-time event to that user.
 *   - Dispute chat uses a per-dispute room `dispute:<dispute_id>` so buyer,
 *     seller, and admin all receive new messages instantly.
 *
 * Auth model mirrors the rest of the project (header-based, no JWT):
 *   - The frontend passes role + id as query params on connect (read from
 *     localStorage). The server trusts these because the host project's
 *     convention is that localStorage is the source of truth for sessions.
 */
let io = null;

/**
 * Initialise Socket.io and attach it to the given HTTP server.
 * Must be called exactly once during server bootstrap.
 */
function initSocket(httpServer) {
  const { Server } = require("socket.io");
  io = new Server(httpServer, {
    cors: {
      origin: "*", // dev — frontend on :3000, backend on :5000
      methods: ["GET", "POST"],
    },
    path: "/socket.io/",
    // Allow long-poll fallback when websocket is blocked (corporate networks,
    // weak networks). Websocket is still preferred when available.
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 10000,
  });

  // ── Connection middleware ─────────────────────────────────────────────
  io.use((socket, next) => {
    const role = socket.handshake.query.role;
    const id   = socket.handshake.query.id;
    if (!role || !id) {
      console.warn("[socket] REJECTED handshake — missing role or id", socket.handshake.query);
      return next(new Error("Missing role or id in socket handshake query"));
    }
    if (!["buyer", "seller", "admin"].includes(role)) {
      console.warn(`[socket] REJECTED handshake — invalid role: ${role}`);
      return next(new Error(`Invalid role: ${role}`));
    }
    socket.role = role;
    socket.userId = id;
    next();
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const room = `${socket.role}:${socket.userId}`;
    socket.join(room);

    // ── v3.2 FIX: Admin joins the literal "admin:admin" room too ──────
    // notify.js always pushes notifications with recipient_id="admin"
    // (literal string), so the admin's socket must be in room "admin:admin"
    // to receive them. The personal "admin:<admin_id>" room is rarely
    // used in practice but doesn't hurt.
    if (socket.role === "admin") {
      socket.join("admins");          // global admin broadcast room
      socket.join("admin:admin");     // literal room — matches notify.js
    }

    console.log(
      `[socket] ✅ CONNECTED  ${room}  (sid=${socket.id})` +
      (socket.role === "admin" ? "  [also in: admins, admin:admin]" : "")
    );

    // Subscribe to a dispute room so buyer/seller/admin all receive
    // messages for that dispute in real time.
    // NOTE: admin is allowed to join a dispute room regardless of the
    // dispute's status (OPEN, UNDER_REVIEW, RESOLVED, CANCELLED) — the
    // previous code implicitly allowed this too, but now we explicitly
    // log it so the user can verify admin presence in the console.
    socket.on("dispute:join", (disputeId) => {
      if (typeof disputeId !== "string") return;
      socket.join(`dispute:${disputeId}`);
      console.log(`[socket] 🚪 ${room} joined dispute:${disputeId}`);
    });

    socket.on("dispute:leave", (disputeId) => {
      if (typeof disputeId !== "string") return;
      socket.leave(`dispute:${disputeId}`);
      console.log(`[socket] 🚪 ${room} left dispute:${disputeId}`);
    });

    // Typing indicator (optional, harmless)
    socket.on("dispute:typing", ({ disputeId, name }) => {
      socket.to(`dispute:${disputeId}`).emit("dispute:typing", { name });
    });

    // Ping for diagnostics — frontend can call socket.emit('ping') to
    // verify the round-trip works.
    socket.on("ping", (cb) => {
      if (typeof cb === "function") cb({ ok: true, t: Date.now() });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] ❌ DISCONNECTED ${room}  (${reason})`);
    });

    socket.on("error", (err) => {
      console.error(`[socket] ⚠ ERROR on ${room}:`, err?.message || err);
    });
  });

  console.log("[socket] Socket.io server initialised (path=/socket.io/)");
  return io;
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
    if (s.role && byRole[s.role] !== undefined) byRole[s.role]++;
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
  emitToUser,
  emitToAdmins,
  emitDisputeMessage,
  getStatus,
  getIO,
};
