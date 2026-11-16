import React, { useEffect, useState } from "react";
import { listAdminPayments, refundPolarPayment } from "../../api/paymentApi";

const REASONS = [
  { id: "customer_request", label: "Customer request" },
  { id: "duplicate", label: "Duplicate" },
  { id: "fraudulent", label: "Fraudulent" },
  { id: "service_disruption", label: "Service disruption" },
  { id: "other", label: "Other" },
];

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [reason, setReason] = useState("customer_request");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listAdminPayments();
      if (!res.success) throw new Error(res.error || "Could not load payments");
      setRows(res.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function refund(tx) {
    const ok = window.confirm(
      `Refund ${tx.transaction_id} (PKR ${Number(tx.total_amount || 0).toLocaleString()})? Unshipped orders in this payment will be cancelled.`
    );
    if (!ok) return;
    setBusyId(tx.transaction_id);
    setNotice("");
    setError("");
    try {
      const res = await refundPolarPayment(tx.transaction_id, { reason });
      if (!res.success) throw new Error(res.error || "Refund failed");
      setNotice(res.message || "Refund sent");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Card payments</h1>
        <p className="text-sm text-gray-500">Polar.sh charges. Captured funds sit in the admin wallet until you release the seller payout on the order.</p>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-500" htmlFor="refund-reason">Refund reason</label>
        <select
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border rounded-lg px-2 py-1 text-sm"
        >
          {REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      {notice && <div className="text-green-700 text-sm mb-3">{notice}</div>}
      {!loading && rows.length === 0 && (
        <div className="bg-white border rounded-2xl p-8 text-center text-sm text-gray-500">No card payments yet.</div>
      )}
      {rows.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Payment</th>
                <th className="p-3">Buyer</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Orders</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr key={tx.transaction_id} className="border-t align-top">
                  <td className="p-3">
                    <div className="font-mono text-xs">{tx.transaction_id}</div>
                    <div className="text-[11px] text-gray-400">{tx.created_at ? new Date(tx.created_at).toLocaleString() : ""}</div>
                    {tx.polar_order_id && <div className="text-[11px] text-gray-400">Polar {tx.polar_order_id}</div>}
                  </td>
                  <td className="p-3">{tx.buyer_name || tx.buyer_id}</td>
                  <td className="p-3 font-semibold">PKR {Number(tx.total_amount || 0).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="uppercase text-xs font-semibold text-[#a37b3d]">{tx.status}</div>
                    {tx.failure_reason && <div className="text-[11px] text-red-600 max-w-[220px]">{tx.failure_reason}</div>}
                    {tx.review_note && <div className="text-[11px] text-amber-700 max-w-[220px]">{tx.review_note}</div>}
                  </td>
                  <td className="p-3 text-xs">{(tx.order_ids || []).join(", ") || "—"}</td>
                  <td className="p-3">
                    {tx.status === "paid" && (
                      <button
                        type="button"
                        onClick={() => refund(tx)}
                        disabled={busyId === tx.transaction_id}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {busyId === tx.transaction_id ? "Refunding…" : "Refund"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
