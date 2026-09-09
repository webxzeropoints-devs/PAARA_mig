import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { useCart } from "../../lib/cart.jsx";
import { getProducts, getToken } from "../../lib/api";
import { fadeUp } from "../../lib/motion";

export default function Cart() {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, count } = useCart();
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(false);
  const [stockAdjusted, setStockAdjusted] = useState(false);

  // Resolve product details (name/price/images) for each cart line.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!items.length) {
        setProducts({});
        return;
      }
      setLoading(true);
      try {
        // /products supports many query params; we can't filter by ids directly,
        // so request all and pick the ones we need (small catalogue assumption).
        const list = await getProducts();
        const map = {};
        for (const p of list) {
          map[p.id] = p;
          if (p.slug) map[p.slug] = p;
        }
        if (!cancelled) setProducts(map);
      } catch (err) {
        if (!cancelled) console.warn("Could not load products for cart", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const lines = useMemo(() => {
    return items.map((line) => {
      const product = products[line.product_id];
      return {
        ...line,
        product,
        subtotal: product?.price ? product.price * line.quantity : 0,
      };
    });
  }, [items, products]);

  useEffect(() => {
    let adjusted = false;
    lines.forEach((line) => {
      const stock = Number(line.product?.stock);
      if (Number.isFinite(stock) && line.quantity > stock) {
        adjusted = true;
        updateQuantity(line.product_id, stock);
      }
    });
    if (adjusted) setStockAdjusted(true);
  }, [lines, updateQuantity]);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.subtotal, 0),
    [lines]
  );

  const formatPrice = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;

  const onCheckout = () => {
    if (!getToken()) {
      navigate("/login", { state: { redirectTo: "/checkout" } });
      return;
    }
    navigate("/checkout");
  };

  if (!count) {
    return (
      <div className="min-h-[70vh] bg-sand text-cocoa font-body flex items-center justify-center px-6">
        <motion.div initial="hidden" animate="show" variants={fadeUp} className="text-center max-w-md">
          <h1 className="font-display text-3xl md:text-4xl mb-3">Your bag is empty</h1>
          <p className="text-sm text-cocoa/60 mb-6">
            Discover pieces made to be loved — your next favourite piece is waiting.
          </p>
          <Link
            to="/shop"
            className="inline-block bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
          >
            Shop the collection
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-14">
        <motion.h1
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="font-display text-3xl md:text-4xl mb-2"
        >
          Your Bag
        </motion.h1>
        <p className="text-sm text-cocoa/60 mb-10">
          {count} {count === 1 ? "piece" : "pieces"} · review before checkout
        </p>

        <div className="grid md:grid-cols-[1fr_360px] gap-10">
          <div className="space-y-6">
            {loading && (
              <p className="text-xs text-cocoa/50">Loading…</p>
            )}
            {lines.map((line) => (
              <div
                key={line.product_id}
                className="flex gap-4 border-b border-cocoa/10 pb-6"
              >
                <div className="w-24 h-28 md:w-28 md:h-32 bg-shell rounded-sm overflow-hidden shrink-0">
                  {line.product?.images?.[0] && (
                    <img
                      src={line.product.images[0]}
                      alt={line.product.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        to={`/product/${line.product?.slug || line.product_id}`}
                        className="font-product-name text-base hover:text-gold transition-colors block"
                      >
                        {line.product?.name || "Paara piece"}
                      </Link>
                      <p className="text-xs text-cocoa/60 mt-1">
                        {line.product?.material || "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(line.product_id)}
                      className="text-xs uppercase tracking-widest text-cocoa/50 hover:text-cocoa transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center border border-cocoa/20 rounded-sm">
                      <button
                        onClick={() => updateQuantity(line.product_id, line.quantity - 1)}
                        className="w-8 h-8 text-sm hover:text-gold transition-colors"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="w-8 h-8 flex items-center justify-center text-sm border-l border-r border-cocoa/20">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(line.product_id, line.quantity + 1)}
                        disabled={Number.isFinite(Number(line.product?.stock)) && line.quantity >= Number(line.product.stock)}
                        className="w-8 h-8 text-sm hover:text-gold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-sm">
                      {line.product?.price != null ? (
                        <span className="font-numeric">{formatPrice(line.subtotal)}</span>
                      ) : (
                        <span className="text-cocoa/40">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <aside className="bg-sand/60 border border-cocoa/10 rounded-sm p-6 h-fit md:sticky md:top-24">
            <h2 className="font-display text-xl mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cocoa/70">Subtotal</span>
                <span className="font-numeric">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-cocoa/50 text-xs">
                <span>Shipping</span>
                <span>calculated at checkout</span>
              </div>
            </div>
            <p className="text-xs text-cocoa/50 mt-3 leading-relaxed">
              Product prices include applicable taxes. Shipping is added at checkout.
            </p>
            {stockAdjusted && <p className="mt-3 text-xs text-red-700">Your bag was updated to match current stock availability.</p>}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onCheckout}
              className="w-full mt-6 bg-gold text-white py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
            >
              Proceed to Checkout
            </motion.button>
            <Link
              to="/shop"
              className="block text-center text-xs uppercase tracking-widest text-cocoa/60 hover:text-gold mt-3 transition-colors"
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
