import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import disputeApi from "../../api/disputeApi";
import SlaCountdown from "../Common/SlaCountdown";

/**
 * AdminDisputesPage — filters (All / Open / Overdue / High Value) + SLA timers.
 */
const STATUS_COLOR = {
  OPEN: "bg-amber-100 text-amber-800",
  SELLER_RESPONSE_PENDING: "bg-amber-100 text-amber-800",
  SELLER_RESPONDED: "bg-yellow-100 text-yellow-800",
  BUYER_REVIEW_PENDING: "bg-orange-100 text-orange-800",
  ADMIN_REVIEW_PENDING: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  APPEALED: "bg-purple-100 text-purple-800",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "high_value", label: "High Value" },
];

const HIGH_VALUE_PKR = 500 * 280; // ~$500 at rough PKR rate; also flag if amount field exists

export default function AdminDisputesPage({ admin }) {
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    if (!admin) return;
    setLoading(true);
    const adminId = admin.admin_id || admin._id;
    const apiFilter = filter === "open" || filter === "overdue" ? filter : undefined;
    const r = await disputeApi.listDisputes("admin", adminId, apiFilter);
    let list = r.success ? r.disputes || [] : [];
    if (filter === "high_value") {
      list = list.filter((d) => {
        const amount = d.order_amount || d.held_amount || 0;
        return amount >= HIGH_VALUE_PKR || d.high_value === true;
      });
    }
    setDisputes(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Disputes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Open, overdue, and high-value cases — resolve from chat
          </p>
        </div>
        <button type="button" onClick={load} className="text-sm text-[#a37b3d]">
          ↻ Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filter === f.id
                ? "bg-[#a37b3d] text-white"
                : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : disputes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">
          No disputes in this filter.
        </div>
      ) : (
        <div className="grid gap-3">
          {disputes.map((d) => {
            const primary =
              d.sla?.primary_deadline ||
              d.admin_resolution_deadline ||
              d.seller_response_deadline;
            const urgent = d.sla?.urgency === "critical" || d.sla?.urgency === "expired";
            return (
              <div
                key={d.dispute_id}
                className={`bg-white rounded-2xl shadow p-4 flex flex-wrap items-center justify-between gap-3 ${
                  urgent ? "ring-1 ring-red-300" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800">
                    {d.dispute_id} — {d.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    Order: {d.order_id} · Buyer: {d.buyer_id} · Seller: {d.seller_id} ·{" "}
                    {d.dispute_type}
                  </p>
                  <p className="text-xs text-gray-400">
                    Opened: {new Date(d.created_at).toLocaleString()}
                    {d.escalation_reason ? ` · Escalation: ${d.escalation_reason}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SlaCountdown
                    deadline={primary}
                    label={d.sla?.primary_label || "SLA"}
                    className="min-w-[140px]"
                  />
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      STATUS_COLOR[d.status] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {d.status}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/disputes/${d.dispute_id}?as=admin`, {
                        state: { asRole: "admin" },
                      })
                    }
                    className="px-3 py-1.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white text-xs rounded-lg font-semibold"
                  >
                    Open Chat & Decide
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
