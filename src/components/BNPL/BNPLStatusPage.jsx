import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import bnplApi from "../../api/bnplApi";
import orderApi from "../../api/orderApi";
import { resolveMediaUrl } from "../../lib/openDoc";

const APPROVAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 5;

// Filter tabs — map BNPL application statuses to the four buckets the
// spec asks for (plus "All").
const FILTER_TABS = [
  { id: 'all',            label: 'All',             statuses: null },
  { id: 'pending',        label: 'Pending',         statuses: ['PENDING_BANK_VERIFICATION', 'PENDING_BNPL_APPROVAL'] },
  { id: 'approved',       label: 'Approved',        statuses: ['OFFER_ACCEPTED', 'APPROVED'] },
  { id: 'rejected',       label: 'Rejected',        statuses: ['REJECTED'] },
  { id: 'cancelled',      label: 'Cancelled',       statuses: ['CANCELLED', 'OFFER_DECLINED', 'OFFER_EXPIRED'] },
];

const DELIVERY_LABEL = {
  standard: 'Standard',
  express:  'Fast Delivery',
  same_day: '1-Day',
};
const deliveryLabel = (m) => DELIVERY_LABEL[m] || (m ? m.replace(/_/g, ' ') : 'Standard');

function fmtRemaining(ms) {
  if (ms <= 0) return "expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function offerDeadlineMs(app) {
  const anchor = app?.decision_at || app?.updated_at || app?.created_at;
  if (!anchor) return null;
  return new Date(anchor).getTime() + APPROVAL_WINDOW_MS;
}

// Countdown color: green → amber → red as deadline approaches
function countdownColor(remainingMs, totalMs) {
  if (remainingMs <= 0) return { ring: '#DC2626', text: 'text-red-600', bg: 'bg-red-50 border-red-200' };
  const pct = remainingMs / totalMs;
  if (pct > 0.5) return { ring: '#10B981', text: 'text-green-600', bg: 'bg-green-50 border-green-200' };
  if (pct > 0.15) return { ring: '#F59E0B', text: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
  return { ring: '#DC2626', text: 'text-red-600', bg: 'bg-red-50 border-red-200' };
}

// Circular countdown ring SVG
function CountdownRing({ remaining, total, size = 120, strokeWidth = 8, color }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = circumference * (1 - pct);
  const pulse = remaining < 86400000 && remaining > 0; // < 24h → pulse

  return (
    <div className={`relative flex items-center justify-center ${pulse ? 'animate-pulse' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black">{fmtRemaining(remaining)}</span>
        <span className="text-xs text-gray-500 mt-1">remaining</span>
      </div>
    </div>
  );
}

export default function BNPLStatusPage({ buyer }) {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [orders, setOrders] = useState([]); // buyer orders — cross-ref for subtotal/items/delivery
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    if (!buyer?.buyer_id) return;
    setLoading(true);
    const [r, repayRes] = await Promise.all([
      bnplApi.listMyApplications(buyer.buyer_id),
      bnplApi.listMyRepayments(buyer.buyer_id).catch(() => ({ success: false })),
    ]);
    setApps(r.success ? r.applications : []);
    setRepayments(repayRes.success ? (repayRes.rows || []) : []);
    // Fetch buyer orders so we can show subtotal / item count / product /
    // delivery type on each BNPL card (the BNPL app itself only carries
    // amount + plan_months).
    orderApi.listBuyerOrders(buyer.buyer_id, { page: 1, limit: 100 }).then(or => {
      setOrders(or.success ? or.orders : []);
    }).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, [buyer]);

  const open = async (appNo) => {
    const r = await bnplApi.getApplication(buyer.buyer_id, appNo);
    if (r.success) setSelected(r.application);
  };

  // Buyer offer-accept removed — bank/auto approval finalizes BNPL.

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-amber-100 text-amber-800",
    PENDING_BANK_VERIFICATION: "bg-amber-100 text-amber-800",
    APPROVED: "bg-blue-100 text-blue-800",
    REJECTED: "bg-red-100 text-red-800",
    OFFER_ACCEPTED: "bg-green-100 text-green-800",
    OFFER_DECLINED: "bg-gray-200 text-gray-700",
    OFFER_EXPIRED: "bg-gray-200 text-gray-700",
    CANCELLED: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100 text-gray-700");

  const ordersByOrderId = useMemo(() => {
    const m = new Map();
    orders.forEach(o => { if (o.order_id) m.set(o.order_id, o); });
    return m;
  }, [orders]);

  const activeTabDef = FILTER_TABS.find(t => t.id === filter) || FILTER_TABS[0];

  const sorted = useMemo(
    () => [...apps]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter(a => !activeTabDef.statuses || activeTabDef.statuses.includes(a.status)),
    [apps, activeTabDef]
  );
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const repaySummary = useMemo(() => {
    return repayments.reduce(
      (acc, r) => {
        acc.total += Number(r.total_amount) || 0;
        acc.paid += Number(r.amount_paid) || 0;
        acc.remaining += Number(r.amount_remaining) || 0;
        return acc;
      },
      { total: 0, paid: 0, remaining: 0 }
    );
  }, [repayments]);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-800">My BNPL</h1>
        <button onClick={load} className="text-sm text-[#a37b3d]">↻ Refresh</button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Applications and repayment status for your financed orders
      </p>

      {/* Repayment overview */}
      {repayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#FBEFF1] shadow-sm p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">Repayment Status</h2>
            <span className="text-xs text-gray-500">{repayments.length} active plan(s)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400 uppercase font-semibold">Total financed</p>
              <p className="text-lg font-extrabold text-gray-900">PKR {repaySummary.total.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[11px] text-emerald-700/70 uppercase font-semibold">Paid so far</p>
              <p className="text-lg font-extrabold text-emerald-700">PKR {repaySummary.paid.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
              <p className="text-[11px] text-amber-700/70 uppercase font-semibold">Outstanding</p>
              <p className="text-lg font-extrabold text-amber-700">PKR {repaySummary.remaining.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {repayments.map((r) => (
              <div key={r.application_no} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{r.application_no}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{r.order_id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.repayment_status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}>{r.repayment_status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Monthly</p>
                    <p className="font-bold">PKR {(r.monthly_installment || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Remaining</p>
                    <p className="font-bold text-amber-700">PKR {(r.amount_remaining || 0).toLocaleString()}</p>
                  </div>
                </div>
                {r.next_due_date && r.repayment_status === "ACTIVE" && (
                  <p className="text-[11px] text-blue-700">
                    Next due: <b>{new Date(r.next_due_date).toLocaleDateString()}</b>
                  </p>
                )}
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{
                      width: `${r.total_amount > 0 ? Math.min(100, Math.round(((r.amount_paid || 0) / r.total_amount) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-bold text-gray-800 mb-2">Applications</h2>
      <p className="text-xs text-gray-500 mb-4">
        Total applications: <b>{totalCount}</b>
        {totalCount > PAGE_SIZE && ` · Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)}`}
      </p>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200/40 w-fit mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === tab.id
                ? 'bg-white text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                : 'text-gray-500 hover:text-gray-950 hover:bg-white/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : totalCount === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center">
          <div className="text-5xl mb-3">📄</div>
          <p className="text-gray-600">
            {filter === 'all' ? 'You have no BNPL applications yet.' : `No ${filter.replace(/_/g, ' ').toLowerCase()} BNPL applications.`}
          </p>
          <button onClick={() => navigate("/buyer/dashboard")}
            className="mt-4 px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold">
            Go to Marketplace
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {paged.map(app => {
              const dl = app.status === "APPROVED" ? offerDeadlineMs(app) : null;
              const remaining = dl ? dl - now : 0;
              const total = APPROVAL_WINDOW_MS;
              const colors = dl && remaining > 0 ? countdownColor(remaining, total) : null;
              const urgent = remaining > 0 && remaining < 86400000;
              // Cross-reference the related order for subtotal/items/delivery
              const order = ordersByOrderId.get(app.order_id);
              const productLabel = (order?.items?.[0]?.title || 'Order') +
                (order?.items && order.items.length > 1 ? ` +${order.items.length - 1}` : '');
              const subtotal = order?.subtotal ?? app.amount ?? 0;
              const itemCount = order?.items_count ?? (order?.items?.length || 0);

              return (
                <div key={app.application_no} className={`bg-white rounded-2xl shadow p-4 flex items-center justify-between ${urgent ? 'ring-2 ring-red-300' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{app.application_no}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(app.created_at).toLocaleString()} • <span className="text-gray-700 font-semibold">BNPL</span>
                      {order?.delivery_method && ` • Delivery: ${deliveryLabel(order.delivery_method)}`}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-700 truncate">{productLabel}</p>
                    {dl && remaining > 0 && (
                      <div className={`mt-2 p-3 rounded-xl border text-center ${colors?.bg || ''}`}>
                        <p className={`font-bold ${colors?.text || 'text-amber-700'}`}>
                          ⏳ Accept/Reject window: {fmtRemaining(remaining)}
                        </p>
                        {urgent && <p className="text-xs text-red-500 mt-1 font-semibold">⚠ Less than 24 hours remaining!</p>}
                      </div>
                    )}
                    {dl && remaining <= 0 && (
                      <p className="text-xs mt-1 text-red-600 font-semibold">
                        ⛔ Response window expired — auto-rejecting…
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0 pl-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">PKR {Number(subtotal).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{itemCount} item(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor(app.status)}`}>{app.status}</span>
                      <button onClick={() => open(app.application_no)}
                        className="text-xs px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg font-semibold">
                        View
                      </button>
                    </div>
                  </div>
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

      {/* Detail modal with countdown ring */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">{selected.application_no}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-2 text-sm">
              <p><b>Status:</b> <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(selected.status)}`}>{selected.status}</span></p>
              <p><b>Order:</b> {selected.order_id}</p>
              <p><b>Amount:</b> PKR {selected.amount.toLocaleString()}</p>
              <p><b>Plan:</b> {selected.plan_months} months</p>
              <p><b>IBAN:</b> <span className="font-mono">{selected.iban_masked}</span></p>
              <p><b>Account Title:</b> {selected.account_title}</p>
              {selected.officer_comment && <p><b>Officer Comment:</b> {selected.officer_comment}</p>}
              {selected.decision_at && <p><b>Decision At:</b> {new Date(selected.decision_at).toLocaleString()}</p>}
            </div>

            {selected.offer && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="font-semibold text-amber-800 mb-2">Offer Letter</h3>
                <p className="text-sm">Approved Amount: <b>PKR {selected.offer.approved_amount.toLocaleString()}</b></p>
                <p className="text-sm">Processing Fee (2%): <b>PKR {selected.offer.processing_fee.toLocaleString()}</b></p>
                <p className="text-sm">Monthly Installment: <b>PKR {selected.offer.monthly_installment.toLocaleString()}</b></p>
                <p className="text-sm">Total Payable: <b>PKR {selected.offer.total_payable.toLocaleString()}</b></p>
                {(selected.offer.amount_paid != null || selected.status === "OFFER_ACCEPTED") && (
                  <>
                    <p className="text-sm mt-2">Paid so far: <b className="text-emerald-700">PKR {(selected.offer.amount_paid || 0).toLocaleString()}</b></p>
                    <p className="text-sm">Outstanding: <b className="text-amber-700">PKR {(selected.offer.amount_remaining ?? Math.max(0, (selected.offer.total_payable || 0) - (selected.offer.amount_paid || 0))).toLocaleString()}</b></p>
                  </>
                )}
              </div>
            )}

            {selected.documents && selected.documents.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold text-gray-700 mb-2">Uploaded Documents</h3>
                <ul className="space-y-1">
                  {selected.documents.map(d => (
                    <li key={d._id || d.doc_type} className="text-xs flex justify-between border border-gray-100 rounded p-2">
                      <span>{d.doc_type} — {d.original_name}</span>
                      <button
                        type="button"
                        className="text-[#a37b3d] font-semibold"
                        onClick={() => {
                          // d.url is a short-lived signed link issued to the signed-in owner.
                          if (d.url) window.open(resolveMediaUrl(d.url), "_blank", "noopener,noreferrer");
                        }}
                      >View</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.status === "OFFER_ACCEPTED" && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                BNPL approved. Your order is confirmed and with the seller for fulfillment — no offer acceptance is required.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
