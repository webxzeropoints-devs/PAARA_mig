import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { downloadInvoice, getOrderById, markLoyaltyAnimationShown, processLoyaltyOrder } from "../../lib/api";
import { fadeUp } from "../../lib/motion";
import LoyaltyAnimationModal from "../../components/LoyaltyAnimationModal";
import { useCart } from "../../lib/cart.jsx";

const formatPrice = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;
const CONFIRMED_PAYMENT_STATUSES = new Set(["paid", "verified", "auto-confirmed - unverified"]);
const paymentLabels = { payu: "PayU" };

export default function OrderConfirmation() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { clear } = useCart();
  const orderId = params.get("order_id");
  const paymentSuccess = params.get("payment") === "success";
  const [order, setOrder] = useState(location.state?.recentOrder || null);
  const [error, setError] = useState("");
  const [downloadState, setDownloadState] = useState("idle");
  const [loyaltyEvent, setLoyaltyEvent] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const loyaltyProcessedOrderRef = React.useRef(null);
  const loyaltyAnimationMarkedRef = React.useRef(false);

  useEffect(() => {
    if (location.state?.clearCart) clear();
  }, [clear, location.state?.clearCart]);

  const copyOrderId = async () => {
    const value = order?.order_number || order?.order_id || orderId;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedOrderId(true);
      window.setTimeout(() => setCopiedOrderId(false), 1800);
    } catch {
      setError("Order ID could not be copied. Please select it manually.");
    }
  };

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let retryTimer;
    let pollTimer;
    let pollAttempts = 0;
    let paymentConfirmed = false;
    const pollingOrderId = location.state?.recentOrder?.id
      ?? location.state?.recentOrder?.order_id
      ?? orderId;
    setError("");
    setPollingStopped(false);
    if (!location.state?.recentOrder) setOrder(null);
    const loadOrder = async () => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await getOrderById(pollingOrderId);
          if (!cancelled) setOrder(data);
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((resolve) => {
              retryTimer = window.setTimeout(resolve, 500);
            });
          }
        }
      }
      if (!cancelled && !location.state?.recentOrder) {
        setError(lastError?.message || "Could not load order");
      }
    };
    loadOrder();
    if (orderId) {
      const pollOrder = async () => {
        if (cancelled) return;
        try {
          const data = await getOrderById(pollingOrderId);
          if (cancelled) return;
          setOrder(data);
          pollAttempts = 0;
          paymentConfirmed = CONFIRMED_PAYMENT_STATUSES.has(String(data?.payment_status || "").trim().toLowerCase());
          if (paymentConfirmed) return;
        } catch (err) {
          pollAttempts += 1;
          if (pollAttempts >= 10 && !cancelled) {
            setPollingStopped(true);
            console.warn("[ORDER_STATUS_POLL_STOPPED]", { orderId, attempts: pollAttempts });
          }
        } finally {
          if (!cancelled && !paymentConfirmed && pollAttempts < 10) pollTimer = window.setTimeout(pollOrder, 5000);
        }
      };
      pollTimer = window.setTimeout(pollOrder, 5000);
    }
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [location.state, orderId, paymentSuccess]);

  useEffect(() => {
    const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();
    if (!orderId || !CONFIRMED_PAYMENT_STATUSES.has(paymentStatus) || loyaltyProcessedOrderRef.current === orderId) return;
    loyaltyProcessedOrderRef.current = orderId;
    let cancelled = false;
    processLoyaltyOrder(orderId)
      .then((result) => {
        if (!cancelled && result?.order?.newlyAwarded) setLoyaltyEvent(result);
      })
      .catch((err) => console.error("[LOYALTY_STATE_REFRESH_FAILED]", { orderId, message: err?.message }));
    return () => { cancelled = true; };
  }, [order?.payment_status, orderId]);

  if (!orderId) {
    return (
      <div className="min-h-[70vh] bg-sand text-cocoa font-body flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="font-display text-3xl mb-3">No order found</h1>
          <p className="text-sm text-cocoa/60 mb-6">
            The order confirmation link is missing or invalid.
          </p>
          <Link
            to="/"
            className="inline-block bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
          >
            Back home
          </Link>
          <Link
            to="/account/orders"
            className="ml-3 inline-block border border-cocoa/30 px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa hover:text-white hover:border-cocoa transition-colors"
          >
            View my orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <div className="max-w-[820px] mx-auto px-6 md:px-10 py-14">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <p className="text-xs uppercase tracking-[0.3em] text-gold mb-3">
            Thank you
          </p>
          <h1 className="font-display text-3xl md:text-4xl mb-2">
            {paymentSuccess ? "Your order has been placed successfully!" : "Your order is confirmed"}
          </h1>
          <p className="text-sm text-cocoa/60 mb-8">
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Order ID: </span>
              <span className="select-all font-medium">{order?.order_number || orderId}</span>
              <button type="button" onClick={copyOrderId} className="border border-cocoa/25 px-2 py-1 text-[10px] uppercase tracking-widest hover:border-gold">
                {copiedOrderId ? "Copied" : "Copy"}
              </button>
            </span>
          </p>

          {paymentSuccess && <div className="mb-6 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your order is saved successfully. You can download the invoice below.</div>}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-sm mb-6">
              {error}
            </div>
          )}
          {pollingStopped && paymentSuccess && (
            <p className="mb-6 text-xs text-cocoa/55">
              We could not refresh the payment status automatically. Please check your order again shortly.
            </p>
          )}

          {!order && !error && (
            <p className="text-sm text-cocoa/60">Loading your order…</p>
          )}

          {order && (
            <>
              <div className="bg-sand/60 border border-cocoa/10 rounded-sm p-6 mb-6">
                <h2 className="font-display text-xl mb-4">Order Summary</h2>
                <div className="mb-5 border-b border-cocoa/10 pb-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-cocoa/70">Payment method</span>
                    <span className="font-medium">{paymentLabels[String(order.payment_method || "").toLowerCase()] || order.payment_method || "Payment"}</span>
                  </div>
                  {String(order.payment_method || "").toLowerCase() === "payu" && (
                    <p className="mt-3 text-xs leading-relaxed text-cocoa/70">
                      PayU payment status: {String(order.payment_status || "unpaid").replace(/_/g, " ")}.
                    </p>
                  )}
                  {(order.estimated_delivery || order.delivery_estimate || order.estimated_delivery_date) && (
                    <p className="mt-3 text-xs text-cocoa/70">Estimated delivery: {order.estimated_delivery || order.delivery_estimate || new Date(order.estimated_delivery_date).toLocaleDateString("en-IN")}</p>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-cocoa/70">Item total</span>
                    <span className="font-numeric">{formatPrice(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cocoa/70">Shipping</span>
                    <span className="font-numeric">{formatPrice(order.shipping_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-cocoa/15 pt-2 mt-2 font-medium">
                    <span>Total</span>
                    <span className="font-numeric">{formatPrice(order.total_amount)}</span>
                  </div>
                  <p className="text-[11px] text-cocoa/50 pt-1">Taxes included in product prices.</p>
                </div>
              </div>

              {Array.isArray(order.items) && order.items.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-display text-xl mb-2">Items</h2>
                  {order.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b border-cocoa/10 pb-3 text-sm"
                    >
                      <span className="font-product-name">
                        {item.product_name || item.name || `Product ${item.product_id}`}{" "}
                        <span className="text-cocoa/50">× {item.quantity}</span>
                      </span>
                      <span>{formatPrice(item.line_total)}</span>
                    </div>
                  ))}
                </div>
              )}

              {loyaltyEvent?.state?.stampCount > 0 && (
                <div className="mt-8 border border-gold/30 bg-gold/10 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-gold">Loyalty Card</p>
                  <p className="mt-2 font-display text-xl">
                    {loyaltyEvent.state.stampCount === 1 ? "Welcome to your Paara Loyalty Card!" : "Your Loyalty Card has been updated."}
                  </p>
                  <p className="mt-2 text-sm text-cocoa/70">
                    You earned 1 stamp on this order! Total balance: {loyaltyEvent.state.stampCount} stamps.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-10">
                <button
                  type="button"
                  onClick={async () => {
                    setDownloadState("loading");
                    try {
                      await downloadInvoice(order.id);
                      setDownloadState("done");
                    } catch (downloadError) {
                      setError(downloadError?.message || "Could not download invoice");
                      setDownloadState("idle");
                    }
                  }}
                  disabled={downloadState === "loading"}
                  className="inline-block bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors disabled:opacity-60"
                >
                  {downloadState === "loading" ? "Preparing invoice…" : "Download invoice"}
                </button>
                <Link
                  to="/account/orders"
                  className="inline-block bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
                >
                  View orders
                </Link>
                <button
                  onClick={() => navigate("/")}
                  className="inline-block border border-cocoa/30 px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa hover:text-white hover:border-cocoa transition-colors"
                >
                  Continue shopping
                </button>
              </div>
            </>
          )}
          <LoyaltyAnimationModal
            isOpen={Boolean(loyaltyEvent)}
            stampIndex={loyaltyEvent?.state?.stampCount}
            totalStamps={6}
            onAnimationComplete={() => {
              if (loyaltyAnimationMarkedRef.current) return;
              loyaltyAnimationMarkedRef.current = true;
              markLoyaltyAnimationShown(orderId)
                .catch((err) => {
                  loyaltyAnimationMarkedRef.current = false;
                  console.error("[LOYALTY_ANIMATION_MARK_FAILED]", { orderId, message: err?.message });
                });
            }}
            onClose={() => {
              if (loyaltyAnimationMarkedRef.current) {
                setLoyaltyEvent(null);
                return;
              }
              loyaltyAnimationMarkedRef.current = true;
              markLoyaltyAnimationShown(orderId)
                .then(() => setLoyaltyEvent(null))
                .catch((err) => console.error("[LOYALTY_ANIMATION_MARK_FAILED]", { orderId, message: err?.message }));
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}
