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

  // Persist items whenever they change
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [items, key]);

  const setBuyerId = useCallback((id) => {
    setBuyerIdState(id || null);
  }, []);

  const addItem = (product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.product_id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.product_id
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateQty = (productId, qty) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems(prev =>
      prev.map(i => i.product_id === productId ? { ...i, qty } : i)
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => {
    const price = i.discount_price || i.price || 0;
    return s + price * i.qty;
  }, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, totalPrice, setBuyerId }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
