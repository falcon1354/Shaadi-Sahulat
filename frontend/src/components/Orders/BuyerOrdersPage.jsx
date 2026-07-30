import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import orderApi from "../../api/orderApi";
import bnplApi from "../../api/bnplApi";

/**
 * BuyerOrdersPage — list buyer's orders + status badges.
 *
 * Spec updates:
 *   - Show 10 most recent by default, paginate beyond, display total count.
 *   - Hide "Complete BNPL Application" button once a BNPL application
 *     already exists for the order.
 */
const PAGE_SIZE = 10;

export default function BuyerOrdersPage({ buyer }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [bnplApps, setBnplApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

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

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [orders]
  );
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Which orders already have a BNPL application submitted?
  const bnplOrderIds = useMemo(() => new Set(bnplApps.map(a => a.order_id)), [bnplApps]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading orders...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-800">My Orders</h1>
      </div>
      <p className="text-xs text-gray-500 mb-6">
        Total orders: <b>{totalCount}</b>
        {totalCount > PAGE_SIZE && ` · Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)}`}
      </p>

      {totalCount === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-gray-600">No orders yet.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {paged.map(o => {
              const hasBnpl = bnplOrderIds.has(o.order_id);
              return (
                <div key={o.order_id} className="bg-white rounded-2xl shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/buyer/orders/${o.order_id}`)}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-gray-800">{o.order_id}</p>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(o.status)}`}>{o.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    Placed: {new Date(o.created_at).toLocaleString()} • Payment: {o.payment_method}
                    {o.bnpl_application_id && ` • BNPL: ${o.bnpl_application_id}`}
                  </div>
                  <div className="text-sm text-gray-700">
                    {o.items_count} item(s) • Subtotal PKR {o.subtotal.toLocaleString()}
                    {o.shipping_total > 0 && ` • Shipping PKR ${o.shipping_total.toLocaleString()}`}
                    {" • Total "}<b>PKR {o.total_amount.toLocaleString()}</b>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 truncate">
                    {o.items.slice(0, 3).map(i => i.title).join(", ")}
                    {o.items.length > 3 && ` +${o.items.length - 3} more`}
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
