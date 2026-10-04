import React, { useState } from "react";

/**
 * Human-friendly title & theme for each raw order status
 */
const STATUS_CONFIG = {
  PENDING_BNPL_APPROVAL: {
    label: "BNPL Application Submitted",
    icon: "🏦",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500 ring-amber-200",
    defaultNote: "Awaiting bank risk assessment & installment approval.",
  },
  CONFIRMED: {
    label: "Order Confirmed",
    icon: "🛍️",
    badge: "bg-blue-50 text-blue-800 border-blue-200",
    dot: "bg-blue-600 ring-blue-200",
    defaultNote: "Order successfully placed and forwarded to seller for preparation.",
  },
  PREPARING: {
    label: "Seller Preparing Package",
    icon: "🧵",
    badge: "bg-purple-50 text-purple-800 border-purple-200",
    dot: "bg-purple-600 ring-purple-200",
    defaultNote: "Dress/items are being tailored, packaged, and prepared for dispatch.",
  },
  SHIPPED: {
    label: "Handed to Courier (Shipped)",
    icon: "🚚",
    badge: "bg-indigo-50 text-indigo-800 border-indigo-200",
    dot: "bg-indigo-600 ring-indigo-200",
    defaultNote: "Package in transit with tracking number assigned.",
  },
  DELIVERED: {
    label: "Package Delivered to Customer",
    icon: "📦",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-600 ring-emerald-200",
    defaultNote: "Delivered to shipping address. 7-day buyer confirmation window active.",
  },
  DISPUTED: {
    label: "Dispute Opened",
    icon: "⚠️",
    badge: "bg-rose-50 text-rose-800 border-rose-200",
    dot: "bg-rose-600 ring-rose-200",
    defaultNote: "Buyer raised an issue with the order. Payout held pending resolution.",
  },
  RESOLVED: {
    label: "Dispute Resolved",
    icon: "⚖️",
    badge: "bg-teal-50 text-teal-800 border-teal-200",
    dot: "bg-teal-600 ring-teal-200",
    defaultNote: "Dispute reviewed and resolved by platform admin.",
  },
  CANCELLED: {
    label: "Order Cancelled",
    icon: "❌",
    badge: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-600 ring-red-200",
    defaultNote: "Order has been cancelled.",
  },
  COMPLETED: {
    label: "Order Complete & Payout Released",
    icon: "💰",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-600 ring-emerald-200",
    defaultNote: "Funds successfully settled and disbursed to seller wallet/bank.",
  },
  PAID: {
    label: "Payment Settled",
    icon: "💳",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-600 ring-emerald-200",
    defaultNote: "Full order payment collected successfully.",
  },
};

const ACTOR_ICONS = {
  buyer: { label: "Buyer", icon: "👤", color: "bg-blue-50 text-blue-700 border-blue-100" },
  seller: { label: "Seller", icon: "🏬", color: "bg-purple-50 text-purple-700 border-purple-100" },
  admin: { label: "Admin", icon: "🛡️", color: "bg-amber-50 text-[#a37b3d] border-amber-200" },
  bank: { label: "Bank Officer", icon: "🏦", color: "bg-teal-50 text-teal-700 border-teal-100" },
  system: { label: "System", icon: "⚙️", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function OrderTimeline({ timeline = [], title = "Order Lifecycle & Activity Timeline", className = "" }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!timeline || timeline.length === 0) {
    return (
      <div className={`bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center py-8 text-gray-400 ${className}`}>
        <span className="text-2xl opacity-40 block mb-1">⏱️</span>
        <p className="text-xs font-semibold">No timeline events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-3xl p-6 shadow-sm border border-gray-100 ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-gray-100 pb-3.5 mb-5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>🌿</span> {title}
          </h3>
          <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
            {timeline.length} {timeline.length === 1 ? 'Milestone' : 'Milestones'}
          </span>
        </div>
      )}

      {/* ── Branching Tree Vertical Timeline ── */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-[#a37b3d]/40 before:via-gray-200 before:to-gray-100">
        {timeline.map((event, idx) => {
          const rawStatus = (event.status || "").toUpperCase();
          const cfg = STATUS_CONFIG[rawStatus] || {
            label: event.status || "Status Update",
            icon: "📌",
            badge: "bg-gray-50 text-gray-800 border-gray-200",
            dot: "bg-gray-500 ring-gray-200",
            defaultNote: "",
          };

          const actorKey = String(event.by || "system").toLowerCase();
          const actor = ACTOR_ICONS[actorKey] || ACTOR_ICONS.system;
          const isExpanded = expandedIndex === idx;
          const displayNote = event.note || cfg.defaultNote;
          const isLast = idx === timeline.length - 1;

          return (
            <div key={idx} className="relative group">
              {/* Branch Node Dot */}
              <div
                className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 border-white shadow-sm ring-4 ${cfg.dot} flex items-center justify-center text-[10px] text-white transition-transform group-hover:scale-110`}
              >
                <span className="text-[9px]">{cfg.icon}</span>
              </div>

              {/* Branch Connecting Leaf Card */}
              <div className="bg-gray-50/70 hover:bg-white transition-all rounded-2xl p-3.5 border border-gray-100 hover:border-gray-200 hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900 tracking-tight">
                      {cfg.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${cfg.badge}`}>
                      {rawStatus || "UPDATE"}
                    </span>
                  </div>

                  <span className="text-[10px] text-gray-400 font-medium font-mono">
                    {event.at ? new Date(event.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : "—"}
                  </span>
                </div>

                {/* Actor Badge */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${actor.color}`}>
                    <span>{actor.icon}</span> Action by: {actor.label}
                  </span>
                </div>

                {/* Clean Note / Description */}
                {displayNote && (
                  <div className="mt-2 text-xs text-gray-600 font-normal leading-relaxed">
                    {displayNote.length > 120 && !isExpanded ? (
                      <>
                        <p>{displayNote.slice(0, 120)}...</p>
                        <button
                          type="button"
                          onClick={() => setExpandedIndex(idx)}
                          className="text-[10px] font-bold text-[#a37b3d] hover:underline mt-0.5"
                        >
                          Show full note →
                        </button>
                      </>
                    ) : (
                      <>
                        <p>{displayNote}</p>
                        {displayNote.length > 120 && (
                          <button
                            type="button"
                            onClick={() => setExpandedIndex(null)}
                            className="text-[10px] font-bold text-gray-400 hover:underline mt-0.5"
                          >
                            Show less
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
