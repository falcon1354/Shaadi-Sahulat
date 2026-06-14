import React, { useState } from 'react';
import sellerApi from '../../api/sellerApi';
import { useCart } from '../../context/CartContext';
import { patchDowryBudgets } from '../../api/buyerApi';
import { useCategories } from '../../hooks/useCategories';

function getDowryBudgets(buyerId) {
  try {
    const key  = buyerId ? `ss_dowry_${buyerId}` : 'ss_dowry_latest';
    const data = JSON.parse(localStorage.getItem(key) || 'null');
    return data?.category_budgets || null;
  } catch { return null; }
}

async function simulateCheckout(items, buyerId) {
  try {
    const key  = buyerId ? `ss_dowry_${buyerId}` : 'ss_dowry_latest';
    const dowry = JSON.parse(localStorage.getItem(key) || 'null');
    if (!dowry?.category_budgets) return;
    const b = { ...dowry.category_budgets };
    items.forEach(item => {
      const cat = item.major_category;
      if (!cat || !b[cat]) return;
      const price = (item.discount_price || item.price || 0) * (item.qty || 1);
      b[cat] = { ...b[cat], spent: (b[cat].spent || 0) + price };
      b[cat].remaining = (b[cat].estimated || 0) - b[cat].spent;
    });
    const updated = JSON.stringify({ ...dowry, category_budgets: b });
    localStorage.setItem('ss_dowry_latest', updated);
    if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, updated);
    if (buyerId) {
      patchDowryBudgets(buyerId, b).catch(() => {});
      window.dispatchEvent(new CustomEvent('dowry-updated', { detail: { buyerId } }));
    }
  } catch {}
}

export default function CartDrawer({ open, onClose, buyerId }) {
  const { items, removeItem, updateQty, totalItems, totalPrice, clearCart } = useCart();
  const { categories } = useCategories();
  const catLabel = (id) => categories.find(c => c.category_id === id)?.label || id?.replace(/_/g, ' ') || id;
  const [checkoutDone, setCheckoutDone] = useState(false);

  const handleCheckout = async () => {
    await simulateCheckout(items, buyerId);
    clearCart();
    setCheckoutDone(true);
    setTimeout(() => { setCheckoutDone(false); onClose(); }, 2000);
  };

  if (!open) return null;

  // §5.3 — per-category cart totals vs budget remaining
  const budgets = getDowryBudgets(buyerId);
  const catTotals = items.reduce((acc, item) => {
    const cat   = item.major_category;
    const price = (item.discount_price || item.price || 0) * item.qty;
    if (!cat) return acc;
    acc[cat] = (acc[cat] || 0) + price;
    return acc;
  }, {});
  const catSummary = Object.entries(catTotals).map(([cat, total]) => ({
    cat,
    total,
    budget: budgets?.[cat] || null,
  }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Cart</h2>
            <p className="text-xs text-gray-400">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1">
            ×
          </button>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🛒</p>
              <p className="text-sm">Your cart is empty.</p>
            </div>
          ) : (
            items.map(item => {
              const imageUrl = sellerApi.resolveImageUrl(item.primary_image_url);
              const price    = item.discount_price || item.price || 0;
              return (
                <div key={item.product_id}
                  className="flex gap-3 p-3 border border-gray-100 rounded-xl hover:border-[#ECD4A8] transition-colors">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                    {imageUrl
                      ? <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                      : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">📦</div>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#a37b3d] font-medium capitalize mb-0.5">
                      {item.major_category?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      PKR {price.toLocaleString()} × {item.qty}
                      <span className="ml-2 font-semibold text-[#a37b3d]">
                        = PKR {(price * item.qty).toLocaleString()}
                      </span>
                    </p>
                    {/* Qty controls */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => updateQty(item.product_id, item.qty - 1)}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-[#FFF5F8] text-gray-600 text-sm font-bold leading-none flex items-center justify-center">
                        −
                      </button>
                      <span className="text-sm font-medium w-4 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.product_id, item.qty + 1)}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-[#FFF5F8] text-gray-600 text-sm font-bold leading-none flex items-center justify-center">
                        +
                      </button>
                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="ml-auto text-xs text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total</span>
              <span className="text-lg font-bold text-[#a37b3d]">PKR {totalPrice.toLocaleString()}</span>
            </div>

            {/* §5.3 Budget Check */}
            {catSummary.length > 0 && budgets && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-600 mb-2">Budget Check</p>
                {catSummary.map(({ cat, total, budget }) => {
                  const remaining  = budget?.remaining ?? budget?.estimated ?? null;
                  const isOver     = remaining !== null && total > remaining;
                  const overAmount = remaining !== null ? total - remaining : 0;
                  return (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 capitalize">{catLabel(cat)}</span>
                      <span className={isOver ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>
                        {remaining === null
                          ? `PKR ${total.toLocaleString()}`
                          : isOver
                            ? `⚠ Over by PKR ${overAmount.toLocaleString()}`
                            : `✓ OK`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {checkoutDone ? (
              <div className="w-full py-3 bg-green-50 border border-green-200 rounded-xl text-center text-sm text-green-700 font-semibold">
                ✅ Order placed! Budget updated.
              </div>
            ) : (
              <>
                <button onClick={clearCart}
                  className="w-full py-2 text-sm text-gray-400 hover:text-red-500 border border-gray-200 rounded-xl transition-colors">
                  Clear Cart
                </button>
                <button
                  onClick={handleCheckout}
                  className="w-full py-2.5 bg-[#a37b3d] hover:bg-[#8a6633] text-white rounded-xl text-sm font-semibold transition-colors">
                  Confirm Order &amp; Update Budget
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
