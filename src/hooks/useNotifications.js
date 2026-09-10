/**
 * useNotifications — REST polling + Socket.io for live notification lists.
 *
 * Also exposes unread_by_type + markTypesRead for sidebar nav badges.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from '../api/reviewNotificationApi';

/** Map sidebar nav ids → notification `type` values that count toward that badge. */
export const NAV_BADGE_TYPES = {
  buyer: {
    orders: ['order', 'package', 'delivery', 'dispute'],
    bnpl: ['bnpl'],
  },
  seller: {
    orders: ['order', 'package'],
    reviews: ['review'],
  },
  admin: {
    orders: ['order', 'payout'],
    disputes: ['dispute'],
    sellers: ['seller'],
  },
};

function countByType(notifications) {
  const map = {};
  for (const n of notifications || []) {
    if (n.read) continue;
    const t = n.type || 'general';
    map[t] = (map[t] || 0) + 1;
  }
  return map;
}

function sumTypes(byType, types) {
  return (types || []).reduce((n, t) => n + (byType[t] || 0), 0);
}

export function useNotifications(userId, role) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [unreadByType, setUnreadByType] = useState({});
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId || !role) {
      setNotifications([]);
      setUnread(0);
      setUnreadByType({});
      setLoading(false);
      return;
    }
    try {
      const res = await listNotifications(userId, role);
      if (!mountedRef.current) return;
      if (res?.success) {
        const list = res.notifications || [];
        setNotifications(list);
        setUnread(res.unread || 0);
        setUnreadByType(res.unread_by_type || countByType(list));
      }
    } catch (err) {
      console.warn('[useNotifications] refresh failed:', err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, role]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  useEffect(() => {
    if (!on) return;
    const off = on('notification:new', (n) => {
      if (n.recipient_role !== role || n.recipient_id !== userId) return;
      setNotifications((prev) => {
        if (prev.some((p) => p.notification_id === n.notification_id)) return prev;
        return [n, ...prev].slice(0, 100);
      });
      setUnread((u) => u + 1);
      setUnreadByType((prev) => {
        const t = n.type || 'general';
        return { ...prev, [t]: (prev[t] || 0) + 1 };
      });
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(n.title || 'New notification', { body: n.message || '' });
        }
      } catch {}
    });
    return off;
  }, [on, role, userId]);

  useEffect(() => {
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id);
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n._id === id || n.notification_id === id ? { ...n, read: true } : n
      );
      setUnreadByType(countByType(next));
      return next;
    });
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId || !role) return;
    await markAllNotificationsRead(userId, role);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    setUnreadByType({});
  }, [userId, role]);

  /** Clear sidebar badge for a nav section by marking matching types read. */
  const markTypesRead = useCallback(async (types) => {
    if (!userId || !role || !types?.length) return;
    await markAllNotificationsRead(userId, role, { types });
    setNotifications((prev) => {
      const next = prev.map((n) =>
        types.includes(n.type) ? { ...n, read: true } : n
      );
      setUnreadByType(countByType(next));
      setUnread(next.filter((n) => !n.read).length);
      return next;
    });
  }, [userId, role]);

  const navBadges = useMemo(() => {
    const map = NAV_BADGE_TYPES[role] || {};
    const out = {};
    for (const [navId, types] of Object.entries(map)) {
      out[navId] = sumTypes(unreadByType, types);
    }
    return out;
  }, [role, unreadByType]);

  return {
    notifications,
    unread,
    unreadByType,
    navBadges,
    loading,
    markRead,
    markAllRead,
    markTypesRead,
    refresh,
  };
}
