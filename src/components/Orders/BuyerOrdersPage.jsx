import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import bnplApi from "../../api/bnplApi";

/**
 * BuyerOrdersPage — list buyer's orders + status badges.
 *
 * Spec updates:
 *   - 5 most recent per page (PAGE_SIZE = 5).
 *   - Filter tabs: All | Delivered | Confirmed | Cancelled.
 *   - Card restructured: subtotal + item count on the RIGHT, product name
 *     with "+N" suffix when more than one item, plain-text payment method,
 *     delivery-type label, no "Placed:" prefix.
 *   - Hide "Complete BNPL Application" button once a BNPL application
 *     already exists for the order.
 */
const PAGE_SIZE = 5;

const FILTER_TABS = [
  { id: 'all',       label: 'All',        statuses: null },
  { id: 'delivered', label: 'Delivered',  statuses: ['DELIVERED', 'COMPLETED'] },
  { id: 'confirmed', label: 'Confirmed',  statuses: ['CONFIRMED', 'PREPARING', 'SHIPPED'] },
  { id: 'cancelled', label: 'Cancelled',  statuses: ['CANCELLED'] },
];

const DELIVERY_LABEL = {
  standard: 'Standard',
  express:  'Fast Delivery',
  same_day: '1-Day',
};
const deliveryLabel = (m) => DELIVERY_LABEL[m] || (m ? m.replace(/_/g, ' ') : 'Standard');

export default function BuyerOrdersPage({ buyer }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [bnplApps, setBnplApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!buyer?.buyer_id) return;
    orderApi.listBuyerOrders(buyer.buyer_id).then(r => {
      setOrders(r.success ? r.orders : []);
      setLoading(false);
    });
    bnplApi.listMyApplications(buyer.buyer_id).then(r => {
      setBnplApps(r.success ? r.applications : []);
    });
  }, [buyer]);

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-blue-100 text-blue-800",
    PREPARING: "bg-purple-100 text-purple-800",
    SHIPPED: "bg-indigo-100 text-indigo-800",
    DELIVERED: "bg-green-100 text-green-800",
    DISPUTED: "bg-red-100 text-red-800",
    RESOLVED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
  }[s] || "bg-gray-100");

  const activeTabDef = FILTER_TABS.find(t => t.id === filter) || FILTER_TABS[0];

  const sorted = useMemo(
    () => [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter(o => !activeTabDef.statuses || activeTabDef.statuses.includes(o.status)),
    [orders, activeTabDef]
  );
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // Clamp page when filter shrinks the list
  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Which orders already have a BNPL application submitted?
  const bnplOrderIds = useMemo(() => new Set(bnplApps.map(a => a.order_id)), [bnplApps]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading orders...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-800">My Orders</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Total orders: <b>{totalCount}</b>
        {totalCount > PAGE_SIZE && ` · Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)}`}
      </p>

      {/* Filter tabs */}
      <div className="flex gap-1.5 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200/40 w-fit mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === tab.id
                ? 'bg-white text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                : 'text-gray-500 hover:text-gray-950 hover:bg-white/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-gray-600">
            {filter === 'all' ? 'No orders yet.' : `No ${filter} orders.`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {paged.map(o => {
              const hasBnpl = bnplOrderIds.has(o.order_id);
              const productLabel = (o.items?.[0]?.title || 'Order') +
                (o.items && o.items.length > 1 ? ` +${o.items.length - 1}` : '');
              return (
                <div key={o.order_id} className="bg-white rounded-2xl shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/buyer/orders/${o.order_id}`)}>
                  {/* Top row: order_id + status badge */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-gray-800">{o.order_id}</p>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(o.status)}`}>{o.status}</span>
                  </div>

                  {/* LEFT: date + payment-method text + delivery type
                      RIGHT: subtotal + item count */}
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="text-xs text-gray-500 space-y-0.5 min-w-0">
                      <p>{new Date(o.created_at).toLocaleString()}</p>
                      <p className="text-gray-700 font-semibold">{o.payment_method}</p>
                      <p>Delivery: {deliveryLabel(o.delivery_method)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">PKR {(o.subtotal || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{o.items_count || (o.items?.length || 0)} item(s)</p>
                    </div>
                  </div>

                  {/* Product name with +N suffix */}
                  <div className="mt-1 text-sm text-gray-700 truncate">
                    {productLabel}
                  </div>

                  {o.status === "PENDING_BNPL_APPROVAL" && o.payment_method === "BNPL" && !hasBnpl && !o.bnpl_application_id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/bnpl/apply/${o.order_id}`); }}
                      className="mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg font-semibold"
                    >
                      Complete BNPL Application →
                    </button>
                  )}
                  {o.status === "PENDING_BNPL_APPROVAL" && (hasBnpl || o.bnpl_application_id) && (
                    <p className="mt-3 text-xs text-green-700 font-semibold">
                      ✓ BNPL application submitted — awaiting bank decision.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40">←</button>
              <span className="text-sm text-gray-600">Page {page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40">→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
