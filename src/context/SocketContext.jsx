/**
 * SocketContext — wraps the app in a single Socket.io client for the signed-in
 * user from AuthProvider (server-verified session; nothing is read from localStorage).
 * Phase 2G will move the handshake from query {role,id} to the access JWT.
 *
 * v3.2.0 FIXES (vs v3.1.0):
 *   - Removed the 1.5-second `setInterval` polling of localStorage. The
 *     polling was creating a brand-new `currentUser` object every 1.5s,
 *     which (a) caused the entire app to re-render every 1.5s, (b) could
 *     in rare cases race with the socket connect effect and leave the
 *     socket in a half-initialised state, and (c) made the socket seem
 *     "flaky" because the connect logs were drowning in setState spam.
 *   - (v3.2 used an `ss_auth_changed` window event; since Phase 2E the socket
 *     follows the AuthProvider user and, since Phase 2G, authenticates with the JWT.)
 *   - Added explicit console logging for connect / disconnect / connect
 *     error with the role:id so the user can verify in the browser
 *     console that the seller / admin really did connect.
 *   - `socket` is now exposed via a ref + state pattern so consumers
 *     re-render when the socket instance actually changes (not on every
 *     parent re-render).
 *   - Added `joinDispute` to auto-rejoin on reconnect (socket.io may
 *     drop + re-establish the connection; the dispute room membership
 *     needs to be re-applied after every successful reconnect).
 *
 * Connection lifecycle:
 *   - The socket is created for the AuthProvider user (role+id from the verified session).
 *   - On login/logout the user changes and the socket is rebuilt / disconnected.
 *   - On unmount, the socket is disconnected.
 *
 * Per spec: "Socket.io is between buyer, seller and Admin, and when the
 * user Select any one then notification occur at Seller, Admin."
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
// JWT handshake + token-refresh/reconnect logic lives in src/api/socketClient.js (unit-tested).
import { createAuthenticatedSocket } from '../api/socketClient';

const BACKEND_URL = 'http://localhost:5000';

const SocketContext = createContext(null);

// Track dispute rooms we've joined so we can re-join after a reconnect.
// Stored outside React state because socket.io's reconnection is
// transparent — we don't want a re-render, we just need to re-emit
// dispute:join for every active dispute.
const joinedDisputesRef = new Set();

export function SocketProvider({ children }) {
  // Connect only while AuthProvider has a server-verified session. The socket
  // authenticates with the in-memory access JWT (handshake.auth.token); the
  // server derives role/id from that token — nothing identity-related is sent.
  const { user } = useAuth();
  const role = user?.role || null;
  const uid = user?.id || null;
  const displayName = user?.name || '';
  const currentUser = useMemo(
    () => (role && uid ? { role, id: uid, name: displayName || role } : null),
    [role, uid, displayName]
  );
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  // Connect / reconnect when user changes
  useEffect(() => {
    // Tear down existing socket
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch {}
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }

    if (!currentUser) return;

    const { socket: newSocket, dispose } = createAuthenticatedSocket(BACKEND_URL);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log(
        `%c[socket] ✅ connected as ${currentUser.role}:${currentUser.id}`,
        'color: green; font-weight: bold'
      );
      // Re-join any dispute rooms we were in before the (re)connect.
      // socket.io rooms are per-connection — they don't persist across
      // reconnects.
      for (const d of joinedDisputesRef) {
        newSocket.emit('dispute:join', d, (res) => {
          if (res && res.ok === false) joinedDisputesRef.delete(d);
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.warn(`[socket] ❌ disconnected: ${reason}`);
    });

    newSocket.on('connect_error', (err) => {
      console.warn(`[socket] ⚠ connect error: ${err?.data?.code || err.message}`);
    });

    newSocket.on('dispute:error', (e) => {
      console.warn(`[socket] dispute access denied: ${e?.dispute_id || ''}`);
    });

    newSocket.on('reconnect', (attempt) => {
      console.log(`[socket] 🔁 reconnected after ${attempt} attempt(s)`);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      dispose();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [currentUser?.role, currentUser?.id]);

  // Helper: join a dispute room
  const joinDispute = useCallback((disputeId) => {
    if (!disputeId) return;
    joinedDisputesRef.add(disputeId);
    socketRef.current?.emit('dispute:join', disputeId, (res) => {
      if (res && res.ok === false) {
        joinedDisputesRef.delete(disputeId);
        console.warn(`[socket] dispute:join ${disputeId} refused: ${res.error}`);
      }
    });
    console.log(`[socket] emit dispute:join ${disputeId}`);
  }, []);

  const leaveDispute = useCallback((disputeId) => {
    if (!disputeId) return;
    joinedDisputesRef.delete(disputeId);
    socketRef.current?.emit('dispute:leave', disputeId);
  }, []);

  // The server shows the verified account name; `name` is kept for call-site compatibility.
  const sendTyping = useCallback((disputeId, _name) => {
    socketRef.current?.emit('dispute:typing', { disputeId });
  }, []);

  // Subscribe to a socket event. Returns an unsubscribe function.
  const on = useCallback((event, handler) => {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => {
      try { socketRef.current?.off(event, handler); } catch {}
    };
  }, []);

  // Listen for socket instance changes (so consumers re-render when
  // socket is first created or torn down on logout).
  useEffect(() => {
    setSocket(socketRef.current);
  }, [isConnected]);

  const value = {
    socket,
    isConnected,
    currentUser,
    joinDispute,
    leaveDispute,
    sendTyping,
    on,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

// ── Helpers ────────────────────────────────────────────────────────────────
