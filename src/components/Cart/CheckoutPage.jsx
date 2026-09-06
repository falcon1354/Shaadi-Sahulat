import React, { useState, useEffect, useRef, useCallback } from "react";
import orderApi from "../../api/orderApi";
import { saveAddress, getSavedAddresses } from "../../api/buyerApi";

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  // Must start with 0; if starts with 3, prepend 0
  let padded = digits;
  if (padded.startsWith('3') && !padded.startsWith('03')) padded = '0' + padded;
  // Ensure starts with 03
  if (!padded.startsWith('03') && padded.length > 0) padded = '03' + padded.replace(/^0+/, '');
  // Cap at 11 digits
  padded = padded.slice(0, 11);
  // Format as 03XX-XXXXXXX
  if (padded.length <= 4) return padded;
  return padded.slice(0, 4) + '-' + padded.slice(4);
}

const DELIVERY_OPTIONS = [
  { id: 'standard', label: 'Standard Delivery', desc: '3-5 business days', price: 150 },
  { id: 'express',  label: 'Express Delivery',  desc: '1-2 business days', price: 350 },
  { id: 'same_day', label: 'Same Day Delivery',  desc: 'Delivery today',     price: 500 },
];

export default function CheckoutPage({ buyer, items, onClose, onSuccess }) {
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [address, setAddress] = useState({
    line1: buyer?.address || "",
    house_number: "",
    city: buyer?.city || "Lahore",
    province: "Punjab",
    phone: buyer?.phone || "",
    notes: "",
  });
  const [deliveryMethod, setDeliveryMethod] = useState("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);

  // Address autocomplete state — Nominatim suggestions shown as a dropdown
  // beneath the Address (line1) field. Typing in line1 triggers the debounced
  // search; selecting a suggestion auto-fills city + province from the
  // Nominatim address components.
  const [addressResults, setAddressResults] = useState([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const addressTimer = useRef(null);
  const addressLineRef = useRef(null);

  // Load saved addresses
  useEffect(() => {
    if (buyer?.buyer_id) {
      getSavedAddresses(buyer.buyer_id).then(r => {
        if (r.success && r.addresses) setSavedAddresses(r.addresses);
      }).catch(() => {});
    }
  }, [buyer?.buyer_id]);

  // Debounced Nominatim address search — driven by the value of address.line1
  const searchAddress = useCallback((query) => {
    if (query.trim().length < 3) { setAddressResults([]); setShowAddressDropdown(false); return; }
    clearTimeout(addressTimer.current);
    addressTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=pk`
        );
        const data = await res.json();
        setAddressResults(data);
        setShowAddressDropdown(data.length > 0);
      } catch { setAddressResults([]); }
    }, 400);
  }, []);

  useEffect(() => {
    searchAddress(address.line1);
    return () => clearTimeout(addressTimer.current);
  }, [address.line1, searchAddress]);

  const selectAddressResult = (result) => {
    const parts = result.display_name.split(', ');
    // Auto-fill city and province from the selected suggestion
    const city = parts.find(p => /city|town|district/i.test(p)) || parts[parts.length - 3] || '';
    const province = parts.find(p => /punjab|sindh|kpk|balochistan|gilgit/i.test(p)) || 'Punjab';
    setAddress(prev => ({
      ...prev,
      line1: result.display_name,
      city: city.replace(/ City/i, '') || prev.city,
      province: province || prev.province,
    }));
    setShowAddressDropdown(false);
    setAddressResults([]);
  };

  const selectSavedAddress = (sa) => {
    setAddress({
      ...address,
      line1: sa.line1 || '',
      house_number: sa.house_number || '',
      city: sa.city || '',
      province: sa.province || 'Punjab',
    });
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value;
    // Block non-numeric characters (except formatting dash)
    if (/[^0-9-]/.test(raw)) return;
    const formatted = formatPhone(raw);
    setAddress({ ...address, phone: formatted });
  };

  const subtotal = items.reduce((s, it) => s + (it.discount_price || it.price) * it.qty, 0);
  const shippingCost = DELIVERY_OPTIONS.find(o => o.id === deliveryMethod)?.price || 0;
  const processingFee = paymentMethod === 'BNPL' ? subtotal * 0.04 : 0;
  const grandTotal = subtotal + shippingCost + processingFee;

  const handlePlaceOrder = async () => {
    setError("");
    if (!address.line1 || !address.city) {
      setError("Please fill in address line1 and city.");
      return;
    }
    if (!items.length) {
      setError("Cart is empty.");
      return;
    }
    setLoading(true);
    try {
      // Build shipping address with house_number
      const shippingAddress = {
        ...address,
        house_number: address.house_number,
      };
      const result = await orderApi.createOrder({
        buyerId: buyer.buyer_id,
        items: items.map(it => ({
          product_id: it.product_id,
          seller_id: it.seller_id,
          title: it.title,
          major_category: it.major_category,
          subcategory: it.subcategory || "",
          item_type: it.item_type || "",
          image_url: it.primary_image_url || it.image_url || "",
          price: it.price,
          discount_price: it.discount_price ?? null,
          qty: it.qty,
        })),
        shippingAddress,
        paymentMethod,
        bankProcessingFee: processingFee,
        deliveryMethod,
        shippingCost,
      });
      if (!result.success) throw new Error(result.error || "Failed to create order");
      setPlacedOrder(result.order);
      // Save address for future use
      if (buyer?.buyer_id && address.line1) {
        saveAddress(buyer.buyer_id, shippingAddress).catch(() => {});
      }
      if (onSuccess) onSuccess(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (placedOrder) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-md">
        <h2 className="text-2xl font-bold text-green-700 mb-4">Order Placed!</h2>
        <p className="text-gray-700 mb-2">Order ID: <span className="font-mono font-semibold">{placedOrder.order_id}</span></p>
        <p className="text-gray-700 mb-2">Status: <span className="font-semibold">{placedOrder.status}</span></p>
        <p className="text-gray-700 mb-4">Total: <span className="font-semibold">PKR {placedOrder.total_amount.toLocaleString()}</span></p>
        {paymentMethod === "BNPL" ? (
          // BNPL → only show "Submit BNPL Request" button (hide View Order)
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-amber-800 text-sm">
              Your order is created with <b>PENDING_BNPL_APPROVAL</b> status.
              Submit your BNPL application with documents to proceed.
            </p>
            <a
              href={`/bnpl/apply/${placedOrder.order_id}`}
              className="inline-block mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold"
            >
              Submit BNPL Request →
            </a>
          </div>
        ) : (
          // COD → only show "View Order" button (no Continue Shopping, no Shipping)
          <a
            href={`/buyer/orders/${placedOrder.order_id}`}
            className="inline-block px-4 py-2 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-lg text-sm font-semibold"
          >
            View Order
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Checkout</h2>

      <div className="mb-6 bg-gray-50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">ORDER SUMMARY</h3>
        {items.map(it => (
          <div key={it.product_id} className="flex justify-between text-sm py-1">
            <span>{it.title} × {it.qty}</span>
            <span>PKR {((it.discount_price || it.price) * it.qty).toLocaleString()}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
          <span>Subtotal</span>
          <span>PKR {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <span>Shipping ({DELIVERY_OPTIONS.find(o => o.id === deliveryMethod)?.label})</span>
          <span>PKR {shippingCost.toLocaleString()}</span>
        </div>
        {processingFee > 0 && (
          <div className="flex justify-between text-sm text-amber-700">
            <span>Bank Processing Fee (4%)</span>
            <span>PKR {processingFee.toLocaleString()}</span>
          </div>
        )}
        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-lg">
          <span>Grand Total</span>
          <span>PKR {grandTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Delivery Address */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">DELIVERY ADDRESS</h3>

        {/* Saved addresses */}
        {savedAddresses.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-1">Saved addresses:</p>
            {savedAddresses.map((sa, i) => (
              <button key={i} onClick={() => selectSavedAddress(sa)}
                className="text-xs text-left w-full px-3 py-2 border border-gray-200 rounded-lg mb-1 hover:bg-[#FFF5F8] hover:border-[#ECD4A8] transition-colors">
                {sa.line1}, {sa.city}, {sa.province}
              </button>
            ))}
          </div>
        )}

        {/* Field order per spec: City → Province → Address (line1, with
            Nominatim autocomplete) → House Number (last). Phone & notes
            follow House Number since they aren't part of the spec reorder. */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="City"
            value={address.city}
            onChange={e => setAddress({ ...address, city: e.target.value })}
          />
          <input
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Province"
            value={address.province}
            onChange={e => setAddress({ ...address, province: e.target.value })}
          />
        </div>

        {/* Address (line1) — carries the Nominatim autocomplete dropdown */}
        <div className="relative mb-2" ref={addressLineRef}>
          <input
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Street, Area (full address line 1) — start typing to search"
            value={address.line1}
            onChange={e => setAddress({ ...address, line1: e.target.value })}
            onFocus={() => addressResults.length > 0 && setShowAddressDropdown(true)}
            onBlur={() => setTimeout(() => setShowAddressDropdown(false), 200)}
            autoComplete="off"
          />
          {showAddressDropdown && addressResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-20 max-h-72 overflow-y-auto">
              {addressResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectAddressResult(r)}
                  className="w-full text-left px-4 py-3 text-base text-gray-800 hover:bg-[#FFF5F8] hover:text-[#a37b3d] border-b border-gray-100 last:border-0 transition-colors leading-snug"
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="House Number (e.g. 42-A)"
          value={address.house_number}
          onChange={e => setAddress({ ...address, house_number: e.target.value })}
        />
        <input
          className="w-full mb-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Phone (03XX-XXXXXXX)"
          value={address.phone}
          onChange={handlePhoneChange}
          maxLength={12}
        />
        <input
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Delivery notes (optional)"
          value={address.notes}
          onChange={e => setAddress({ ...address, notes: e.target.value })}
        />
      </div>

      {/* Delivery Method */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">DELIVERY METHOD</h3>
        {DELIVERY_OPTIONS.map(opt => (
          <label key={opt.id} className={`block border rounded-xl p-3 mb-2 cursor-pointer ${deliveryMethod === opt.id ? "border-[#a37b3d] bg-[#FFF5F8]" : "border-gray-200"}`}>
            <input
              type="radio"
              name="delivery"
              checked={deliveryMethod === opt.id}
              onChange={() => setDeliveryMethod(opt.id)}
              className="mr-2"
            />
            <span className="font-semibold text-gray-800">{opt.label}</span>
            <span className="text-xs text-gray-500 ml-2">{opt.desc} — PKR {opt.price}</span>
          </label>
        ))}
      </div>

      {/* Payment Method */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">PAYMENT METHOD</h3>
        <label className={`block border rounded-xl p-3 mb-2 cursor-pointer ${paymentMethod === "COD" ? "border-[#a37b3d] bg-[#FFF5F8]" : "border-gray-200"}`}>
          <input
            type="radio"
            name="payment"
            checked={paymentMethod === "COD"}
            onChange={() => setPaymentMethod("COD")}
            className="mr-2"
          />
          <span className="font-semibold text-gray-800">Cash on Delivery</span>
          <span className="text-xs text-gray-500 ml-2">Pay when you receive</span>
        </label>
        <label className={`block border rounded-xl p-3 cursor-pointer ${paymentMethod === "BNPL" ? "border-[#a37b3d] bg-[#FFF5F8]" : "border-gray-200"}`}>
          <input
            type="radio"
            name="payment"
            checked={paymentMethod === "BNPL"}
            onChange={() => setPaymentMethod("BNPL")}
            className="mr-2"
          />
          <span className="font-semibold text-gray-800">Bank Installment Plan (BNPL)</span>
          <span className="text-xs text-gray-500 ml-2">Get approved in minutes. 3 or 6 month plan. 4% processing fee.</span>
        </label>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        onClick={handlePlaceOrder}
        disabled={loading}
        className="w-full py-3 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Placing Order..." : `PLACE ORDER — PKR ${grandTotal.toLocaleString()}`}
      </button>
    </div>
  );
}
