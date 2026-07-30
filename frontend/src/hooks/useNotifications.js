/**
 * useNotifications — combines REST polling (initial load) with Socket.io
 * real-time push (incremental updates) to keep a live notifications list.
 *
 * Returns:
 *   notifications : array (newest first)
 *   unread        : number
 *   loading       : bool
 *   markRead      : (id) => Promise
 *   markAllRead   : () => Promise
 *   refresh       : () => Promise
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from '../api/reviewNotificationApi';

export function useNotifications(userId, role) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId || !role) {
      setNotifications([]);
      setUnread(0);
      setLoading(false);
      return;
    }
    try {
      const res = await listNotifications(userId, role);
      if (!mountedRef.current) return;
      if (res?.success) {
        setNotifications(res.notifications || []);
        setUnread(res.unread || 0);
      }
    } catch (err) {
      console.warn('[useNotifications] refresh failed:', err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, role]);

  // Initial + on user/role change
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  // Real-time: listen for new notifications over socket.io
  useEffect(() => {
    if (!on) return;
    const off = on('notification:new', (n) => {
      // Only accept notifications targeted at this user
      if (n.recipient_role !== role || n.recipient_id !== userId) return;
      setNotifications((prev) => {
        // De-duplicate by notification_id
        if (prev.some((p) => p.notification_id === n.notification_id)) return prev;
        return [n, ...prev].slice(0, 100);
      });
      setUnread((u) => u + 1);
      // Optional browser notification (best-effort)
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(n.title || 'New notification', { body: n.message || '' });
        }
      } catch {}
    });
    return off;
  }, [on, role, userId]);

  // Periodic refresh fallback (every 30s) in case socket misses an event
  useEffect(() => {
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) =>
      n._id === id || n.notification_id === id ? { ...n, read: true } : n
    ));
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId || !role) return;
    await markAllNotificationsRead(userId, role);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }, [userId, role]);

  return { notifications, unread, loading, markRead, markAllRead, refresh };
}
