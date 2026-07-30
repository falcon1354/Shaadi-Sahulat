import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

function storageKey(buyerId) {
  return buyerId ? `ss_cart_${buyerId}` : 'ss_cart_guest';
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

  const addItem = (product) => {
    const stock = product.stock_quantity || Infinity;
    if (stock === 0) return; // Don't add if out of stock
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.product_id);
      if (existing) {
        const newQty = Math.min(existing.qty + 1, stock);
        return prev.map(i =>
          i.product_id === product.product_id
            ? { ...i, qty: newQty }
            : i
        );
      }
      return [...prev, { ...product, qty: 1, stock_quantity: stock, seller_id: product.seller_id }];
    });
  };

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateQty = (productId, qty) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems(prev =>
      prev.map(i => {
        if (i.product_id !== productId) return i;
        const stock = i.stock_quantity || Infinity;
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
