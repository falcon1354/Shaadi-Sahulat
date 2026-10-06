import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

function storageKey(buyerId) {
  return buyerId ? `ss_cart_${buyerId}` : 'ss_cart_guest';
}

function resolveStock(product) {
  const raw = product?.stock_quantity ?? product?.stock_qty;
  if (raw === undefined || raw === null || raw === '') return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Infinity;
}

export function CartProvider({ children }) {
  const [buyerId, setBuyerIdState] = useState(null);
  const key = storageKey(buyerId);

  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(null)) || '[]');
    } catch {
      return [];
    }
  });

  // When buyer logs in/out, swap to their cart
  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch {
      setItems([]);
    }
  }, [key]);

  // Remove cart items whose products no longer exist (cascade delete guard)
  const removeDeletedItems = (productIds) => {
    const ids = new Set(productIds);
    setItems(prev => {
      const filtered = prev.filter(i => !ids.has(i.product_id));
      if (filtered.length !== prev.length) {
        localStorage.setItem(key, JSON.stringify(filtered));
      }
      return filtered;
    });
  };

  // Persist items whenever they change
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [items, key]);

  const setBuyerId = useCallback((id) => {
    setBuyerIdState(id || null);
  }, []);

  /**
   * @returns {{ ok: boolean, reason?: string, qty?: number }}
   */
  const addItem = (product, qty = 1) => {
    if (!product?.product_id) {
      return { ok: false, reason: 'This item cannot be added right now.' };
    }
    const stock = resolveStock(product);
    if (stock <= 0) {
      return { ok: false, reason: 'This item is out of stock.' };
    }
    const addQty = Math.max(1, Math.min(Number(qty) || 1, stock));
    let result = { ok: true, qty: addQty };

    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.product_id);
      if (existing) {
        if (existing.qty >= stock) {
          result = { ok: false, reason: `Only ${stock} in stock.` };
          return prev;
        }
        const newQty = Math.min(existing.qty + addQty, stock);
        result = { ok: true, qty: newQty };
        return prev.map(i =>
          i.product_id === product.product_id
            ? { ...i, qty: newQty, stock_quantity: stock }
            : i
        );
      }
      return [...prev, {
        ...product,
        qty: addQty,
        stock_quantity: Number.isFinite(stock) ? stock : product.stock_quantity,
        seller_id: product.seller_id,
      }];
    });

    return result;
  };

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateQty = (productId, qty) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems(prev =>
      prev.map(i => {
        if (i.product_id !== productId) return i;
        const stock = resolveStock(i);
        const cappedQty = Math.min(qty, stock);
        return { ...i, qty: cappedQty };
      })
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => {
    const price = i.discount_price || i.price || 0;
    return s + price * i.qty;
  }, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice, setBuyerId, removeDeletedItems }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
