import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import disputeApi from "../../api/disputeApi";

/**
 * AdminDisputesPage — High quality dispute oversight dashboard.
 * - Shows Human-readable Buyer Name and Seller Name (not raw IDs)
 * - Clean order titles & friendly dispute categories
 * - Interactive hover tooltips for underlying hashes (Dispute ID, Order ID, Package ID)
 */
const STATUS_BADGE = {
  OPEN: "bg-amber-50 text-amber-800 border-amber-200/60",
  SELLER_RESPONSE_PENDING: "bg-amber-50 text-amber-800 border-amber-200/60",
  SELLER_RESPONDED: "bg-yellow-50 text-yellow-800 border-yellow-200/60",
  BUYER_REVIEW_PENDING: "bg-orange-50 text-orange-800 border-orange-200/60",
  ADMIN_REVIEW_PENDING: "bg-blue-50 text-blue-800 border-blue-200/60",
  UNDER_REVIEW: "bg-indigo-50 text-indigo-800 border-indigo-200/60",
  RESOLVED: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
  CANCELLED: "bg-rose-50 text-rose-800 border-rose-200/60",
  APPEALED: "bg-purple-50 text-purple-800 border-purple-200/60",
};

const DISPUTE_TYPE_LABELS = {
  not_received: "📦 Package Not Received",
  item_not_as_described: "🔍 Not As Described",
  damaged: "⚠️ Damaged Item",
  wrong: "🔄 Wrong Item Sent",
  missing: "❌ Missing Pieces",
  quality_issue: "⭐ Quality Issue",
  poor_quality: "⭐ Quality Issue",
  other: "📝 Other Inquiry",
};

const FILTERS = [
  { id: "all", label: "All Cases" },
  { id: "open", label: "Open & Pending" },
  { id: "resolved", label: "Resolved / Closed" },
];

export default function AdminDisputesPage({ admin }) {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [hoveredDispute, setHoveredDispute] = useState(null);

  const load = async () => {
    setLoading(true);
    const adminId = admin?.admin_id || admin?._id || "admin_001";
    const r = await disputeApi.listDisputes("admin", adminId);
    let list = r.success ? r.disputes || [] : [];
    if (filter === "open") {
      list = list.filter((d) => !["RESOLVED", "CANCELLED"].includes(d.status) && !String(d.status).startsWith("CLOSED_"));
    } else if (filter === "resolved") {
      list = list.filter((d) => ["RESOLVED", "CANCELLED"].includes(d.status) || String(d.status).startsWith("CLOSED_"));
    }
    setDisputes(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [admin, filter]);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl">
              ⚖️
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dispute Resolution Center</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Arbitrate customer complaints, inspect evidence, and enforce buyer &amp; seller guarantees
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="px-3.5 py-2 rounded-2xl border border-gray-200 hover:border-gray-300 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white transition-all shadow-sm"
          >
            ↻ Refresh Disputes
          </button>
        </div>
      </div>

      {/* ── Filter Pills Bar ── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isSelected = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-sm ${
                isSelected
                  ? "bg-gray-900 text-white shadow-md"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ── Dispute Cards Grid ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-3">
          <div className="w-9 h-9 border-4 border-[#a37b3d] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-gray-500">Loading disputes...</p>
        </div>
      ) : disputes.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 text-center text-gray-400 space-y-2">
          <span className="text-3xl opacity-40">✨</span>
          <p className="text-sm font-bold text-gray-700">No disputes found</p>
          <p className="text-xs text-gray-400">All customer orders in this filter view are in good standing.</p>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {disputes.map((d) => {
            const isResolved = ["RESOLVED", "CANCELLED"].includes(d.status) || String(d.status).startsWith("CLOSED_");
            const typeLabel = DISPUTE_TYPE_LABELS[d.dispute_type] || d.dispute_type;
            const orderTitle = d.order_name || d.title || `Order ${d.order_id}`;
            const buyerDisplayName = d.buyer_name || "Customer";
            const sellerDisplayName = d.seller_name || "Seller";

            return (
              <div
                key={d.dispute_id}
                onMouseEnter={() => setHoveredDispute(d)}
                onMouseLeave={() => setHoveredDispute(null)}
                className="relative bg-white rounded-3xl p-5 shadow-sm border border-gray-200 hover:border-gray-300 transition-all hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Left: Headline, Buyer/Seller names & Reason */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-black text-gray-900 tracking-tight">
                        {orderTitle}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-[#a37b3d] border border-amber-200/60">
                        {typeLabel}
                      </span>
                      {isResolved && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ Resolved
                        </span>
                      )}
                    </div>

                    {/* Buyer & Seller Names (NOT raw IDs) */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                        <span>👤</span> Buyer: <strong className="ml-0.5 font-bold">{buyerDisplayName}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
                        <span>🏬</span> Seller: <strong className="ml-0.5 font-bold">{sellerDisplayName}</strong>
                      </span>
                      {d.order_amount ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                          PKR {Number(d.order_amount).toLocaleString()}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-[11px] text-gray-400">
                      Opened: {new Date(d.created_at || d.opened_at || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {d.escalation_reason ? ` • Escalation: ${d.escalation_reason}` : ""}
                    </p>
                  </div>

                  {/* Right: Status, Action */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`text-[11px] px-3 py-1 rounded-full font-bold border ${
                        STATUS_BADGE[d.status] || "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {d.status}
                    </span>

                    {isResolved ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/disputes/${d.dispute_id}?as=admin`, {
                            state: { asRole: "admin" },
                          })
                        }
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs rounded-2xl font-bold transition-all border border-gray-200"
                      >
                        View Details →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/disputes/${d.dispute_id}?as=admin`, {
                            state: { asRole: "admin" },
                          })
                        }
                        className="px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-2xl font-bold transition-all shadow-sm"
                      >
                        Review &amp; Decide →
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Hover Tooltip / Popover for Technical Metadata ── */}
                {hoveredDispute?.dispute_id === d.dispute_id && (
                  <div className="absolute right-4 bottom-full mb-2 w-72 p-3.5 bg-gray-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-gray-800 z-50 pointer-events-none hidden md:block animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Dispute Technical Metadata</span>
                      <span className="text-[10px] text-gray-400">{d.status}</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="text-gray-400 text-[10px] block">Dispute ID:</span>
                        <span className="font-mono text-gray-200 font-medium text-[10px]">{d.dispute_id}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[10px] block">Order Ref:</span>
                        <span className="font-mono text-amber-200/90 font-medium text-[10px]">{d.order_id}</span>
                      </div>
                      {d.package_id && (
                        <div>
                          <span className="text-gray-400 text-[10px] block">Package Ref:</span>
                          <span className="font-mono text-gray-300 text-[10px]">{d.package_id}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800/80 mt-1 text-[10px]">
                        <div>
                          <span className="text-gray-400 block">Buyer:</span>
                          <span className="text-gray-200 font-semibold truncate block">{buyerDisplayName}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Seller:</span>
                          <span className="text-gray-200 font-semibold truncate block">{sellerDisplayName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
