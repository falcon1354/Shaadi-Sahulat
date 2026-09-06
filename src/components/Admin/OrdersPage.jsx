import React, { useState, useEffect, useRef } from "react";
import adminExtApi from "../../api/adminExtApi";

/**
 * OrdersPage — admin oversight of ALL orders.
 *
 * Tabs:
 *   • "All Orders"   — paginated list (10 per page) with status filter + search
 *   • "Pending Release" — orders awaiting payment release (DELIVERED/RESOLVED
 *     with no payout yet), each with a live 24-hour countdown timer.
 *
 * Auto-release happens server-side at the top of GET /orders. For the
 * frontend, overdue orders display a prominent "Release Now" button that
 * calls POST /orders/:order_id/release-payment immediately.
 *
 * Per BNPL&Delivery.md Module 2 — admin "has complete information of each
 * and every thing".
 */
const STATUS_CONFIG = {
  PENDING_BNPL_APPROVAL: { color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500"  },
  CONFIRMED:             { color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500"   },
  PREPARING:             { color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  SHIPPED:               { color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  DELIVERED:             { color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500"  },
  DISPUTED:              { color: "bg-red-100 text-red-700 border-red-200",       dot: "bg-red-500"    },
  RESOLVED:              { color: "bg-teal-100 text-teal-700 border-teal-200",    dot: "bg-teal-500"   },
  CANCELLED:             { color: "bg-gray-200 text-gray-700 border-gray-300",    dot: "bg-gray-500"   },
  COMPLETED:             { color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};
const STATUSES = Object.keys(STATUS_CONFIG);
const PER_PAGE = 10;

/**
 * Live countdown timer for the pending-release section. Renders
 * "Release in: HH:MM:SS" while there's still time left, and
 * "OVERDUE — Auto-releasing" in red when overdue. Updates every second.
 */
function CountdownTimer({ releaseDueAt, overdue }) {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const dueMs = releaseDueAt ? new Date(releaseDueAt).getTime() : 0;
  const remainingMs = dueMs - now;
  const isOverdue = overdue || remainingMs <= 0;

  if (isOverdue) {
    return <span className="text-xs font-bold text-red-600">OVERDUE — Auto-releasing</span>;
  }

  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const hours   = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSec % 60).padStart(2, '0');
  return <span className="text-xs font-mono font-semibold text-gray-700">Release in: {hours}:{minutes}:{seconds}</span>;
}

export default function OrdersPage({ admin }) {
  const [orders, setOrders]       = useState([]);
  const [pendingRelease, setPendingRelease] = useState([]);
  const [filter, setFilter]       = useState("");
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [detail, setDetail]       = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [msg, setMsg]             = useState("");
  const [tab, setTab]             = useState("all");   // "all" | "pending-release"
  const [page, setPage]           = useState(1);

  const adminId = admin?.admin_id || admin?._id;

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    // Always refresh both lists so the tab toggle doesn't show stale data.
    const [ordersResp, pendingResp] = await Promise.all([
      adminExtApi.listOrders(adminId, { status: filter || undefined, q: search || undefined }),
      adminExtApi.listPendingReleaseOrders(adminId),
    ]);
    setOrders(ordersResp.success ? ordersResp.orders : []);
    setPendingRelease(pendingResp.success ? pendingResp.orders : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [adminId, filter]);
  // Reset to page 1 when filter or tab changes.
  useEffect(() => { setPage(1); }, [filter, tab, search]);

  const openDetail = async (orderId) => {
    const r = await adminExtApi.getOrderDetail(adminId, orderId);
    if (r.success) { setDetail(r); setMsg(""); }
  };

  const releasePayment = async (orderId) => {
    if (!confirm(`Release payment for order ${orderId}? This will mark it COMPLETED and transfer funds to seller.`)) return;
    setReleasing(true); setMsg("");
    const r = await adminExtApi.releasePayment(adminId, orderId);
    setReleasing(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg(`✓ Payment released. TXN: ${r.payout.transaction_id}. Net to seller: PKR ${r.payout.net_to_seller.toLocaleString()}`);
    if (detail?.order?.order_id === orderId) openDetail(orderId);
    load();
  };

  // ── Pagination for the "All Orders" tab ─────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(orders.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pagedOrders = orders.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const statusStats = STATUSES.map(s => ({ status: s, count: orders.filter(o => o.status === s).length }))
    .filter(s => s.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage all customer orders — admin in loop on every status</p>
        </div>
        <button onClick={load} className="text-sm text-[#a37b3d]">↻ Refresh</button>
      </div>

      {/* Tabs: All Orders vs Pending Release */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            tab === "all"
              ? "border-[#a37b3d] text-[#a37b3d]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All Orders ({orders.length})
        </button>
        <button
          onClick={() => setTab("pending-release")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            tab === "pending-release"
              ? "border-[#a37b3d] text-[#a37b3d]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Pending Release ({pendingRelease.length})
        </button>
      </div>

      {msg && <div className="bg-blue-50 text-blue-700 rounded-lg p-2 text-sm">{msg}</div>}

      {tab === "all" && (
        <>
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            placeholder="Search by order ID, buyer name, or email..."
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
          />

          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${!filter ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200"}`}
            >
              All ({orders.length})
            </button>
            {statusStats.map(({ status, count }) => {
              const cfg = STATUS_CONFIG[status];
              return (
                <button key={status} onClick={() => setFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === status ? "bg-gray-800 text-white border-gray-800" : cfg.color}`}>
                  {status.replace(/_/g, " ")} ({count})
                </button>
              );
            })}
          </div>

          {/* Orders table (10 per page) */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">No orders found.</div>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                    <tr>
                      <th className="text-left p-3">Order ID</th>
                      <th className="text-left p-3">Buyer</th>
                      <th className="text-left p-3">Items</th>
                      <th className="text-right p-3">Total</th>
                      <th className="text-left p-3">Payment</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Date</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOrders.map(o => {
                      const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.CONFIRMED;
                      return (
                        <tr key={o.order_id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-3 font-mono text-xs">{o.order_id}</td>
                          <td className="p-3 text-sm">{o.buyer_name}<br/><span className="text-xs text-gray-500">{o.buyer_email}</span></td>
                          <td className="p-3 text-sm">{o.items_count}</td>
                          <td className="p-3 text-right text-sm font-semibold">PKR {o.total_amount.toLocaleString()}</td>
                          <td className="p-3 text-sm">{o.payment_method}<br/><span className="text-xs text-gray-500">{o.payment_status}</span></td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${cfg.color}`}>
                              {o.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => openDetail(o.order_id)}
                              className="text-xs px-3 py-1 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg font-semibold">
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {safePage} of {totalPages} · {orders.length} orders
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "pending-release" && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading pending-release orders...</div>
          ) : pendingRelease.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">
              No orders are currently awaiting payment release.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-amber-50 text-xs text-amber-800 uppercase">
                  <tr>
                    <th className="text-left p-3">Order ID</th>
                    <th className="text-left p-3">Buyer</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Delivered At</th>
                    <th className="text-left p-3">Countdown</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRelease.map(o => {
                    const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.DELIVERED;
                    const isOverdue = !!o.overdue;
                    return (
                      <tr key={o.order_id} className={`border-t border-gray-100 ${isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="p-3 font-mono text-xs">{o.order_id}</td>
                        <td className="p-3 text-sm">{o.buyer_name}<br/><span className="text-xs text-gray-500">{o.buyer_email}</span></td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${cfg.color}`}>
                            {o.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500">
                          {o.delivered_at ? new Date(o.delivered_at).toLocaleString() : '—'}
                        </td>
                        <td className="p-3">
                          {o.release_due_at
                            ? <CountdownTimer releaseDueAt={o.release_due_at} overdue={isOverdue} />
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="p-3 text-right text-sm font-semibold">PKR {o.total_amount.toLocaleString()}</td>
                        <td className="p-3 text-right space-x-2">
                          <button onClick={() => openDetail(o.order_id)}
                            className="text-xs px-3 py-1 border border-gray-200 text-gray-700 rounded-lg font-semibold">
                            View
                          </button>
                          {isOverdue && (
                            <button
                              onClick={() => releasePayment(o.order_id)}
                              disabled={releasing}
                              className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold disabled:opacity-50"
                            >
                              ⚠ Release Now
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            Auto-release happens server-side. For overdue orders, use <b>Release Now</b> to trigger the payout immediately.
          </p>
        </>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Order {detail.order.order_id}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 text-2xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div><b>Buyer:</b> {detail.order.buyer_name}<br/><b>Email:</b> {detail.order.buyer_email}<br/><b>Phone:</b> {detail.order.buyer_phone}</div>
              <div><b>Status:</b> {detail.order.status}<br/><b>Payment:</b> {detail.order.payment_method} ({detail.order.payment_status})<br/><b>Total:</b> PKR {detail.order.total_amount.toLocaleString()}</div>
              <div className="col-span-2"><b>Ship to:</b> {detail.order.shipping_address.line1}, {detail.order.shipping_address.city}, {detail.order.shipping_address.province}</div>
              {detail.order.bnpl_application_id && <div className="col-span-2"><b>BNPL Application:</b> {detail.order.bnpl_application_id}</div>}
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">ITEMS</h3>
              {detail.order.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span>{it.title} × {it.qty} <span className="text-xs text-gray-500">({it.seller_id})</span></span>
                  <span>PKR {it.subtotal.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">PACKAGES ({detail.packages.length})</h3>
              {detail.packages.map(p => (
                <div key={p.package_id} className="text-xs border border-gray-100 rounded p-2 mb-1">
                  <b>{p.package_id}</b> — seller {p.seller_id} — status <b>{p.status}</b>
                  {p.tracking_number && <span> • Courier: {p.courier_company} (#{p.tracking_number})</span>}
                  {p.net_to_seller > 0 && <span> • Net to seller: PKR {p.net_to_seller.toLocaleString()}</span>}
                </div>
              ))}
            </div>

            {detail.disputes && detail.disputes.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-red-800 mb-1">DISPUTES</h3>
                {detail.disputes.map(d => (
                  <p key={d.dispute_id} className="text-xs">{d.dispute_id} — {d.dispute_type} — {d.status}</p>
                ))}
              </div>
            )}

            {detail.payout && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-green-800 mb-1">PAYOUT RELEASED</h3>
                <p className="text-xs">TXN: {detail.payout.transaction_id} • Net to seller: PKR {detail.payout.net_to_seller.toLocaleString()} • Date: {new Date(detail.payout.released_at).toLocaleString()}</p>
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">TIMELINE</h3>
              <div className="space-y-1">
                {(detail.order.timeline || []).map((t, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-gray-400">{new Date(t.at).toLocaleString()}</span> —
                    <b> {t.status}</b> by {t.by}
                    {t.note && <span className="text-gray-600"> — {t.note}</span>}
                  </div>
                ))}
              </div>
            </div>

            {msg && <div className="bg-blue-50 text-blue-700 rounded-lg p-2 text-sm mb-3">{msg}</div>}

            {/* Release payment */}
            {["DELIVERED", "RESOLVED"].includes(detail.order.status) && !detail.payout && (
              <button onClick={() => releasePayment(detail.order.order_id)} disabled={releasing}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {releasing ? "Releasing..." : "💰 RELEASE PAYMENT TO SELLER (Step 10)"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
