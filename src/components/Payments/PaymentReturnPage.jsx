import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { syncPolarCheckout } from "../../api/paymentApi";
import { useCart } from "../../context/CartContext";

const DONE = new Set(["paid", "refunded", "failed", "expired"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const checkoutId = params.get("checkout_id") || "";
  const { clearCart } = useCart();
  const clearCartRef = useRef(clearCart);
  clearCartRef.current = clearCart;
  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      if (!checkoutId || checkoutId.includes("{")) {
        setError("Polar did not return a checkout id.");
        setWaiting(false);
        return;
      }
      try {
        let last = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const res = await syncPolarCheckout(checkoutId);
          if (cancelled) return;
          if (!res.success) throw new Error(res.error || "Could not confirm the payment");
          last = res.transaction;
          setTransaction(res.transaction);
          if (DONE.has(res.transaction?.status)) break;
          await sleep(2000);
        }
        if (last?.status === "paid") clearCartRef.current();
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not confirm the payment");
      } finally {
        if (!cancelled) setWaiting(false);
      }
    }
    confirm();
    return () => { cancelled = true; };
  }, [checkoutId]);

  const paid = transaction?.status === "paid";

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-md">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Card payment</h1>
      {waiting && <p className="text-sm text-gray-500 mb-4">Confirming the payment with Polar…</p>}
      {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      {transaction && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700">
          <p>Payment: <span className="font-mono font-semibold">{transaction.transaction_id}</span></p>
          <p>Status: <span className="font-semibold">{transaction.status}</span></p>
          <p>Total: <span className="font-semibold">PKR {Number(transaction.total_amount || 0).toLocaleString()}</span></p>
          {transaction.failure_reason && <p className="text-red-600 mt-2">{transaction.failure_reason}</p>}
          {paid && transaction.order_ids?.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-green-700 mb-1">Order confirmed</p>
              {transaction.order_ids.map((id) => (
                <Link key={id} to={`/buyer/orders/${id}`} className="block text-[#a37b3d] font-semibold hover:underline">
                  {id}
                </Link>
              ))}
            </div>
          )}
          {transaction.status === "refunded" && (
            <p className="mt-2 text-amber-700">This charge was refunded. No order was placed.</p>
          )}
        </div>
      )}
      <Link to="/buyer/payments" className="inline-block px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold">
        My card payments
      </Link>
    </div>
  );
}
