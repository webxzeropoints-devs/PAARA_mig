// Shared cart context — frontend-only state per AI_BUILD_BRIEF §3.
// Cart is { product_id, quantity }[], persisted to localStorage.
// Backend is the source of truth at checkout via POST /orders.

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

const CART_KEY = "paara_cart";

const CartContext = createContext(null);

const readCart = () => {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readCart());

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // ignore quota errors silently
    }
  }, [items]);

  const addItem = useCallback((product_id, quantity = 1, product = null) => {
    setItems((prev) => {
      const stock = Number(product?.stock);
      if (Number.isFinite(stock) && stock <= 0) return prev;
      const idx = prev.findIndex((i) => i.product_id === product_id);
      if (idx >= 0) {
        const next = [...prev];
        const requested = next[idx].quantity + quantity;
        next[idx] = { ...next[idx], ...(product ? { name: product.name, price: product.price, stock } : {}), quantity: Number.isFinite(stock) ? Math.min(requested, stock) : requested };
        return next;
      }
      return [...prev, { product_id, quantity: Number.isFinite(stock) ? Math.min(quantity, stock) : quantity, ...(product ? { name: product.name, price: product.price, stock } : {}) }];
    });
  }, []);

  const updateQuantity = useCallback((product_id, quantity, product = null) => {
    const nextQuantity = Math.floor(Number(quantity));
    setItems((prev) => {
      if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) return prev.filter((i) => i.product_id !== product_id);
      return prev.map((i) => {
        if (i.product_id !== product_id) return i;
        const stock = Number(product?.stock ?? i.stock);
        return {
          ...i,
          ...(product ? { name: product.name, price: product.price, stock } : {}),
          quantity: Number.isFinite(stock) && stock >= 0
            ? Math.min(nextQuantity, stock)
            : nextQuantity,
        };
      }).filter((i) => i.product_id !== product_id || i.quantity > 0);
    });
  }, []);

  const removeItem = useCallback((product_id) => {
    setItems((prev) => prev.filter((i) => i.product_id !== product_id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addItem, updateQuantity, removeItem, clear, count }),
    [items, addItem, updateQuantity, removeItem, clear, count]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};
