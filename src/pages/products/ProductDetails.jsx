import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";

import { getProductBySlug, getToken, resolveAssetUrl } from "../../lib/api";
import { useCart } from "../../lib/cart.jsx";
import { fadeUp } from "../../lib/motion";
import Seo from "../../components/Seo";

const formatPrice = (n) =>
  typeof n === "number" ? `₹${n.toLocaleString("en-IN")}` : "—";

export default function ProductDetails() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { addItem, items } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setProduct(null);
    getProductBySlug(slug)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setSelectedImage(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Could not load product");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const images = Array.isArray(product?.images)
    ? product.images.filter(Boolean).slice(0, 3)
    : [];

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product.id, quantity, product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem(product.id, quantity, product);
    if (!getToken()) {
      navigate("/login", { state: { redirectTo: "/checkout" } });
      return;
    }
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-sand text-cocoa font-body flex items-center justify-center">
        <p className="text-sm text-cocoa/60">Loading…</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[60vh] bg-sand text-cocoa font-body flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="font-display text-3xl mb-3">Piece not found</h1>
          <p className="text-sm text-cocoa/60 mb-6">{error || "This piece may have drifted away."}</p>
          <button
            onClick={() => navigate("/shop")}
            className="bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
          >
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  const price = product.price ?? 0;
  const cartQuantity = items.find((item) => String(item.product_id) === String(product.id))?.quantity || 0;
  const stock = Number(product.stock);
  const hasStock = Number.isFinite(stock) && stock > 0;
  const maxReached = Number.isFinite(stock) && cartQuantity >= stock;

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <Seo title={product.name} description={product.description || `${product.name} by Paara Jewellery, crafted for everyday moments.`} image={resolveAssetUrl(images[0])} type="product" />
      <div className="max-w-[1300px] mx-auto px-6 md:px-10 py-10 md:py-14">
        <button
          onClick={() => navigate(-1)}
          className="text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa transition-colors mb-6"
        >
          ← Back
        </button>

        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            {images.length === 0 ? (
              <div className="aspect-square rounded-sm border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                Product images are unavailable. Please try again later.
              </div>
            ) : <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="flex flex-col gap-3">
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`aspect-square bg-shell rounded-sm overflow-hidden border transition-colors ${
                      selectedImage === i ? "border-gold" : "border-cocoa/15 hover:border-cocoa/40"
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="relative bg-shell rounded-sm overflow-hidden aspect-square">
                <motion.img
                  key={selectedImage}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  src={images[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
                {product.is_exclusive && (
                  <span className="absolute top-4 left-4 px-3 py-1 bg-espresso-ink/85 text-pearl font-script italic text-sm rounded-sm tracking-wide">
                    Exclusive
                  </span>
                )}
              </div>
            </div>}
          </motion.div>

          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            {product.category && (
              <p className="text-xs uppercase tracking-widest text-gold mb-2">
                {product.category}
              </p>
            )}
            <h1 className="font-product-name text-3xl md:text-4xl mb-3">{product.name}</h1>
            {product.description && (
              <>
                <h2 className="font-display text-xl mb-2">Product Description</h2>
                <p className="text-sm text-cocoa/70 leading-relaxed mb-6">{product.description}</p>
              </>
            )}

            <div className="border-t border-b border-cocoa/10 py-4 my-6 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-cocoa/70">Price</span>
                <span className="font-numeric">{formatPrice(price)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span className="font-numeric">{formatPrice(price)}</span>
              </div>
              <p className="text-[11px] text-cocoa/50 mt-1">
                Taxes included in the displayed product price. Shipping is calculated at checkout.
              </p>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <span className="text-xs uppercase tracking-widest text-cocoa/60">Quantity</span>
              <div className="flex items-center border border-cocoa/20 rounded-sm">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 hover:text-gold transition-colors"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-9 h-9 grid place-items-center text-sm border-l border-r border-cocoa/20">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => Number.isFinite(stock) ? Math.min(stock, q + 1) : q + 1)}
                  disabled={Number.isFinite(stock) && quantity >= stock}
                  className="w-9 h-9 hover:text-gold transition-colors"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAddToCart}
                disabled={!hasStock || maxReached}
                className="bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!hasStock ? "Out of stock" : added ? "✓ Added to cart" : maxReached ? "Maximum in bag" : cartQuantity > 0 ? `Add to cart · In bag: ${cartQuantity}` : "Add to cart"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleBuyNow}
                disabled={!hasStock || maxReached}
                className="border border-cocoa/30 px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa hover:text-white hover:border-cocoa transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Buy now
              </motion.button>
            </div>
            {stock === 1 && <p className="mt-3 text-xs text-gold">Only 1 left</p>}

            {product.material && (
              <p className="text-xs text-cocoa/60 mt-6">
                Material: <span className="text-cocoa">{product.material}</span>
              </p>
            )}
            {product.instagram && Array.isArray(product.instagram) && product.instagram.length > 0 && (
              <div className="mt-8">
                <p className="text-xs uppercase tracking-widest text-cocoa/60 mb-2">
                  As seen on Instagram
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {product.instagram.slice(0, 6).map((entry, i) => (
                    <div key={i} className="aspect-square bg-shell rounded-sm overflow-hidden">
                      <img src={entry.image_url || entry} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
