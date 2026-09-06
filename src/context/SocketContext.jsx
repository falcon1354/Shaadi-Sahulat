/**
 * SocketContext — wraps the app in a single Socket.io client that auto-
 * authenticates using the current buyer/seller/admin from localStorage.
 *
 * v3.2.0 FIXES (vs v3.1.0):
 *   - Removed the 1.5-second `setInterval` polling of localStorage. The
 *     polling was creating a brand-new `currentUser` object every 1.5s,
 *     which (a) caused the entire app to re-render every 1.5s, (b) could
 *     in rare cases race with the socket connect effect and leave the
 *     socket in a half-initialised state, and (c) made the socket seem
 *     "flaky" because the connect logs were drowning in setState spam.
 *   - Now listens for a custom `ss_auth_changed` window event that the
 *     AuthContext fires whenever login/logout happens. The socket is
 *     torn down + rebuilt exactly once per real auth change.
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
 *   - On mount, the socket is created with role+id from localStorage.
 *   - On `ss_auth_changed` event (login/logout), the socket is rebuilt.
 *   - On unmount, the socket is disconnected.
 *
 * Per spec: "Socket.io is between buyer, seller and Admin, and when the
 * user Select any one then notification occur at Seller, Admin."
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:5000';

const SocketContext = createContext(null);

// Track dispute rooms we've joined so we can re-join after a reconnect.
// Stored outside React state because socket.io's reconnection is
// transparent — we don't want a re-render, we just need to re-emit
// dispute:join for every active dispute.
const joinedDisputesRef = new Set();

export function SocketProvider({ children }) {
  // Determine the current user from localStorage (mirror AuthProvider logic)
  const [currentUser, setCurrentUser] = useState(() => readCurrentUser());
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  // Re-read current user whenever the AuthContext signals a change
  // (login / logout). This replaces the old 1.5-second polling which
  // caused excessive re-renders and intermittent socket flakiness.
  useEffect(() => {
    const handler = () => {
      const next = readCurrentUser();
      // Only update if role/id actually changed (deep equality on the
      // two fields we care about).
      setCurrentUser((prev) => {
        const sameRole = prev?.role === next?.role;
        const sameId   = prev?.id   === next?.id;
        if (sameRole && sameId) return prev; // bail out — no real change
        return next;
      });
    };
    window.addEventListener('ss_auth_changed', handler);
    // One-shot read on mount in case AuthContext fired before this effect
    // attached (it can happen on page reload).
    handler();
    return () => window.removeEventListener('ss_auth_changed', handler);
  }, []);

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

    const newSocket = io(BACKEND_URL, {
      path: '/socket.io/',
      query: { role: currentUser.role, id: currentUser.id },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });

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
        newSocket.emit('dispute:join', d);
      }
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.warn(`[socket] ❌ disconnected: ${reason}`);
    });

    newSocket.on('connect_error', (err) => {
      console.warn(`[socket] ⚠ connect error: ${err.message}`);
    });

    newSocket.on('reconnect', (attempt) => {
      console.log(`[socket] 🔁 reconnected after ${attempt} attempt(s)`);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      try { newSocket.disconnect(); } catch {}
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [currentUser?.role, currentUser?.id]);

  // Helper: join a dispute room
  const joinDispute = useCallback((disputeId) => {
    if (!disputeId) return;
    joinedDisputesRef.add(disputeId);
    socketRef.current?.emit('dispute:join', disputeId);
    console.log(`[socket] emit dispute:join ${disputeId}`);
  }, []);

  const leaveDispute = useCallback((disputeId) => {
    if (!disputeId) return;
    joinedDisputesRef.delete(disputeId);
    socketRef.current?.emit('dispute:leave', disputeId);
  }, []);

  const sendTyping = useCallback((disputeId, name) => {
    socketRef.current?.emit('dispute:typing', { disputeId, name });
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
function readCurrentUser() {
  try {
    const buyerStr  = localStorage.getItem('ss_buyer');
    const sellerStr = localStorage.getItem('ss_seller');
    const adminStr  = localStorage.getItem('ss_admin');
    if (adminStr) {
      const a = JSON.parse(adminStr);
      if (a && (a.admin_id || a._id)) {
        return { role: 'admin', id: a.admin_id || a._id, name: a.name || 'Admin' };
      }
    }
    if (sellerStr) {
      const s = JSON.parse(sellerStr);
      if (s && s.seller_id) {
        return { role: 'seller', id: s.seller_id, name: s.name || s.seller_name || 'Seller' };
      }
    }
    if (buyerStr) {
      const b = JSON.parse(buyerStr);
      if (b && b.buyer_id) {
        return { role: 'buyer', id: b.buyer_id, name: b.name || 'Buyer' };
      }
    }
  } catch (e) {
    console.warn('[socket] readCurrentUser failed:', e);
  }
  return null;
}
