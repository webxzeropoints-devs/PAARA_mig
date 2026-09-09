import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";

import { prefersReducedMotion } from "../lib/motion";
import { useWishlist } from "../lib/wishlist.jsx";
import { getToken, resolveAssetUrl } from "../lib/api";

// Product shape (from §3 GET /products):
//   { id, slug, name, price, images: [url,...], is_exclusive, rating?, reviews_count? }

const formatPrice = (n) =>
  typeof n === "number"
    ? `₹${n.toLocaleString("en-IN")}`
    : n || "";

export default function ProductFlipCard({ product, index = 0, compact = false, boutique = false, bestseller = false, disableReveal = false, navigateOnClick = false, disableFlip = false }) {
  const [flipped, setFlipped] = useState(false);
  const navigate = useNavigate();
  const reducedMotion = prefersReducedMotion();
  const { isSaved, toggle } = useWishlist();
  const productId = product?.id ?? product?.slug;
  const saved = productId != null && isSaved(productId);
  const stock = Number(product?.stock);
  const isOutOfStock = Number.isFinite(stock) && stock <= 0;
  const isLowStock = stock === 1;

  const images = Array.isArray(product?.images) && product.images.length
    ? product.images.filter(Boolean)
    : product?.image
      ? [product.image]
      : [];

  // Only one image is ever shown on the front face — no hover image swap.
  const resolvedImages = images.map(resolveAssetUrl);
  const frontImg = resolvedImages[0];
  const marqueeImgs =
    resolvedImages.length > 1
      ? resolvedImages
      : resolvedImages.length === 1
        ? [resolvedImages[0], resolvedImages[0], resolvedImages[0], resolvedImages[0]]
        : [];

  // Marquee duration scales with image count, 6–10s linear per §7.
  const marqueeDuration = Math.min(
    10,
    Math.max(6, marqueeImgs.length * 1.8)
  );

  // Click/tap (not hover) per §4.1 — works on mobile.
  const onActivate = () => {
    if (navigateOnClick) {
      navigate(`/product/${product?.slug || product?.id}`);
      return;
    }
    if (reducedMotion) {
      setFlipped((v) => !v);
      return;
    }
    setFlipped((v) => !v);
  };

  return (
    <motion.div
      initial={disableReveal ? false : bestseller ? { opacity: 0, y: 20, scale: 0.9 } : { opacity: 0, y: 18 }}
      animate={disableReveal ? { opacity: 1, y: 0 } : undefined}
      whileInView={disableReveal ? undefined : bestseller ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0 }}
      viewport={disableReveal ? undefined : { once: true }}
      whileHover={bestseller ? { y: -8, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", transition: { duration: 0.3, ease: "easeOut" } } : undefined}
      transition={disableReveal ? { duration: 0 } : { duration: 0.6, delay: bestseller ? (index + 1) * 0.1 : index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative min-w-0 ${compact ? "w-56 md:w-64 shrink-0" : "w-full"} ${boutique ? "max-w-[280px] mx-auto" : ""}`}
    >
      <div
        className={`relative w-full aspect-[4/5] ${disableFlip ? "" : "[perspective:1200px] cursor-pointer"}`}
        {...(!disableFlip && {
          onClick: onActivate,
          role: "button",
          tabIndex: 0,
          "aria-pressed": flipped,
          "aria-label": `${product?.name || "Product"} — ${navigateOnClick ? "view product" : "tap to flip"}`,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActivate();
            }
          },
        })}
      >
        <motion.div
          className={`absolute inset-0 ${disableFlip ? "" : "[transform-style:preserve-3d]"}`}
          animate={disableFlip ? undefined : {
            rotateY: flipped ? 180 : 0,
            scale: flipped ? 1.02 : 1,
          }}
          transition={{
            rotateY: { duration: 0.7, ease: [0.45, 0, 0.55, 1] },
            scale: { duration: 0.35, ease: "easeOut" },
          }}
          style={disableFlip ? undefined : { transformStyle: "preserve-3d" }}
        >
          {/* FRONT FACE */}
          <div
            className={`absolute inset-0 [backface-visibility:hidden] bg-shell rounded-sm overflow-hidden ${navigateOnClick ? "cursor-pointer" : ""}`}
            style={{ backfaceVisibility: "hidden" }}
            onClick={navigateOnClick ? onActivate : undefined}
          >
            {frontImg ? (
              <img
                src={frontImg}
                alt={product?.name}
                loading="lazy"
                className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${navigateOnClick ? "cursor-pointer" : ""}`}
                onClick={navigateOnClick ? (event) => {
                  event.stopPropagation();
                  onActivate();
                } : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-red-700">
                Image unavailable
              </div>
            )}
            {product?.is_exclusive && (
              <span className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 px-1.5 py-0.5 sm:px-3 sm:py-1 bg-espresso-ink/85 text-pearl font-script italic text-xs sm:text-sm rounded-sm tracking-wide">
                Exclusive
              </span>
            )}
            {(isLowStock || isOutOfStock) && (
              <span className={`absolute bottom-2 left-2 rounded-sm px-2 py-1 text-[10px] uppercase tracking-wide ${isOutOfStock ? "bg-cocoa/85 text-white" : "bg-gold/90 text-white"}`}>
                {isOutOfStock ? "Out of stock" : "Only 1 left"}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!getToken()) {
                  navigate("/login");
                  return;
                }
                if (productId != null) toggle(productId).catch((error) => {
                  console.error("[paara] wishlist update failed", error);
                });
              }}
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={saved}
              className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 bg-sand/80 backdrop-blur-sm rounded-full p-1.5 sm:p-2 hover:bg-sand transition-colors"
            >
              <Heart
                size={16}
                strokeWidth={1.4}
                className={saved ? "text-gold" : "text-cocoa"}
                fill={saved ? "currentColor" : "none"}
              />
            </button>
          </div>

          {!disableFlip && (
            <div
              className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-shell rounded-sm overflow-hidden"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <div className="w-full h-full overflow-hidden">
                <div
                  className="flex h-full will-change-transform"
                  style={{
                    width: "200%",
                    animation: flipped
                      ? `paara-marquee ${marqueeDuration}s linear infinite`
                      : "none",
                    animationPlayState: flipped ? "running" : "paused",
                  }}
                >
                  {[...marqueeImgs, ...marqueeImgs].map((src, i) => (
                    <img
                      key={`${src}-${i}`}
                      src={src}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-full w-1/3 object-cover shrink-0"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="mt-1.5 sm:mt-3 px-1.5 sm:px-0">
        <Link
          to={`/product/${product?.slug || product?.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-product-name text-xs sm:text-sm text-cocoa hover:text-gold transition-colors block line-clamp-2"
        >
          {product?.name}
        </Link>
        <div className={`font-numeric text-xs sm:text-sm text-gold mt-1 ${boutique ? "font-medium" : ""}`}>{formatPrice(product?.price)}</div>
      </div>

      <style>{`
        @keyframes paara-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

      `}</style>
    </motion.div>
  );
}
