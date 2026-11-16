import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyPayments } from "../../api/paymentApi";

export default function BuyerPaymentsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyPayments()
      .then((res) => {
        if (!res.success) throw new Error(res.error || "Could not load payments");
        setRows(res.transactions || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Card payments</h1>
      <p className="text-sm text-gray-500 mb-4">Charges made through Polar. An order appears only after the payment is confirmed.</p>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      {!loading && rows.length === 0 && (
        <div className="bg-white border rounded-2xl p-8 text-center text-sm text-gray-500">
          No card payments yet. Choose Card payment (Polar) at checkout.
        </div>
      )}
      <div className="space-y-3">
        {rows.map((tx) => (
          <div key={tx.transaction_id} className="bg-white border rounded-2xl p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold text-gray-800">{tx.transaction_id}</p>
                <p className="text-xs text-gray-500">{tx.created_at ? new Date(tx.created_at).toLocaleString() : ""}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">PKR {Number(tx.total_amount || 0).toLocaleString()}</p>
                <p className="text-xs uppercase tracking-wide text-[#a37b3d]">{tx.status}</p>
              </div>
            </div>
            {tx.order_ids?.length > 0 && (
              <div className="mt-2 text-sm">
                {tx.order_ids.map((id) => (
                  <Link key={id} to={`/buyer/orders/${id}`} className="mr-3 text-[#a37b3d] font-semibold hover:underline">{id}</Link>
                ))}
              </div>
            )}
            {tx.failure_reason && <p className="text-xs text-red-600 mt-2">{tx.failure_reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
