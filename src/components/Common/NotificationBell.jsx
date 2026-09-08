/**
 * NotificationBell — dropdown showing real-time notifications for the
 * currently logged-in buyer / seller / admin.
 *
 * Powered by Socket.io (live) + REST polling (fallback).
 * Lives in the header of every portal.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import { useSocket } from '../../context/SocketContext';

const TYPE_ICON = {
  order:    '📦',
  package:  '📦',
  delivery: '🚚',
  bnpl:     '💳',
  dispute:  '⚠️',
  payout:   '💰',
  review:   '⭐',
  system:   '🔔',
};

const TYPE_COLOR = {
  order:    'bg-blue-50 text-blue-600',
  package:  'bg-blue-50 text-blue-600',
  delivery: 'bg-purple-50 text-purple-600',
  bnpl:     'bg-indigo-50 text-indigo-600',
  dispute:  'bg-amber-50 text-amber-600',
  payout:   'bg-green-50 text-green-600',
  review:   'bg-yellow-50 text-yellow-600',
  system:   'bg-gray-50 text-gray-600',
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
}

export default function NotificationBell({ userId, role, onNavigate }) {
  const { notifications, unread, loading, markRead, markAllRead } = useNotifications(userId, role);
  const { isConnected } = useSocket();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Click outside to close
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Request browser notification permission on first mount
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
  }, []);

  if (!userId || !role) return null;

  const handleClick = (n) => {
    if (!n.read) markRead(n._id || n.notification_id);
    // Navigate based on type
    if (onNavigate) {
      if (n.type === 'order' || n.type === 'package' || n.type === 'delivery') {
        if (role === 'buyer')  onNavigate(`/buyer/orders/${n.ref_id}`);
        else if (role === 'seller') onNavigate(`/seller/orders`);
        else if (role === 'admin')  onNavigate(`/admin/orders`);
      } else if (n.type === 'dispute') {
        onNavigate(`/disputes/${n.ref_id}?as=${role}`);
      } else if (n.type === 'review') {
        if (role === 'seller') onNavigate('/seller/reviews');
        else if (role === 'admin') onNavigate('/admin/reviews');
      } else if (n.type === 'bnpl') {
        if (role === 'buyer')  onNavigate('/buyer/bnpl');
        else if (role === 'admin') onNavigate('/admin/orders');
      } else if (n.type === 'payout') {
        if (role === 'seller') onNavigate('/seller/finance');
        else if (role === 'admin') onNavigate('/admin/wallet');
      }
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        title="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        {/* Socket.io connection dot */}
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
          title={isConnected ? 'Real-time connected' : 'Disconnected — using polling'}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3]">
            <div>
              <p className="text-sm font-bold text-gray-800">Notifications</p>
              <p className="text-[10px] text-gray-500">
                {isConnected ? '● Live (Socket.io)' : '○ Polling every 30s'}
                {unread > 0 && ` · ${unread} unread`}
              </p>
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-semibold text-[#a37b3d] hover:text-[#8a6633] bg-white px-2.5 py-1 rounded-lg border border-[#FBEFF1]"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <div className="w-6 h-6 mx-auto mb-2 border-2 border-gray-200 border-t-[#a37b3d] rounded-full animate-spin" />
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <p className="text-4xl mb-2">🔔</p>
                <p>No notifications yet</p>
                <p className="text-xs mt-1">You'll see order updates, reviews, and disputes here.</p>
              </div>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <button
                  key={n._id || n.notification_id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-[#FFF5F8] transition-colors flex gap-3 ${!n.read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${TYPE_COLOR[n.type] || TYPE_COLOR.system}`}>
                    {TYPE_ICON[n.type] || '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 line-clamp-1">{n.title}</p>
                      <span className="text-[9px] text-gray-400 shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">{n.message}</p>
                    {!n.read && (
                      <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full mt-1" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-center">
              <p className="text-[10px] text-gray-400">Showing {Math.min(notifications.length, 30)} of {notifications.length}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
