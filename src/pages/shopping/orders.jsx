import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { downloadInvoice, getAddresses, getOrders, getToken } from "../../lib/api";
import { fadeUp } from "../../lib/motion";

const formatPrice = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;

export default function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const [savedAddress, setSavedAddress] = useState(null);

  const customerName = useMemo(() => {
    const stateName = location.state?.customerName;
    if (stateName) return stateName;
    const storedName = window.localStorage.getItem("paara_customer_name");
    if (storedName) return storedName;
    return "Customer";
  }, [location.state]);

  const selectedAddress = useMemo(() => {
    const address = location.state?.selectedAddress || savedAddress;
    if (!address) return null;
    return [
      address.line1,
      address.line2,
      [address.city, address.state, address.pincode].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ");
  }, [location.state, savedAddress]);

  useEffect(() => {
    if (!getToken()) {
      navigate("/login", { state: { redirectTo: "/account/orders" }, replace: true });
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getAddresses()
      .then((data) => {
        if (cancelled) return;
        const addresses = Array.isArray(data) ? data : data?.addresses || [];
        setSavedAddress(addresses.find((address) => address.is_default) || addresses[0] || null);
      })
      .catch(() => {
        if (!cancelled) setSavedAddress(null);
      });
    getOrders()
      .then((data) => {
        if (cancelled) return;
        const customerOrders = Array.isArray(data) ? data : data?.orders || [];
        setOrders(customerOrders);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Could not load orders");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleDownloadInvoice = async (orderId) => {
    setDownloadingInvoice(orderId);
    setError("");
    try {
      await downloadInvoice(orderId);
    } catch (err) {
      setError(err?.message || "Could not download invoice");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <div className="max-w-[1000px] mx-auto px-6 md:px-10 py-14">
        <motion.h1
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="font-display text-3xl md:text-4xl mb-2"
        >
          Your Orders
        </motion.h1>
        <p className="text-sm text-cocoa/60 mb-10">History of every Paara piece you've taken home.</p>

        {(customerName || selectedAddress) && (
          <div className="mb-8 rounded-sm border border-cocoa/10 bg-sand/60 p-5">
            <p className="text-[10px] uppercase tracking-[.28em] text-gold">Account</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-[.24em] text-cocoa/50">Name</p>
                <p className="mt-2 font-medium text-lg">{customerName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[.24em] text-cocoa/50">Address</p>
                <p className="mt-2 text-sm text-cocoa/80">{selectedAddress || "Address not available"}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-sm mb-6">
            {error}
          </div>
        )}

        {loading && <p className="text-sm text-cocoa/60">Loading…</p>}

        {!loading && !error && orders.length === 0 && (
          <div className="bg-sand/60 border border-cocoa/10 rounded-sm p-10 text-center">
            <h2 className="font-display text-2xl mb-2">No completed orders yet</h2>
            <p className="text-sm text-cocoa/60 mb-6">
              Delivered orders will appear here.
            </p>
            <Link
              to="/shop"
              className="inline-block bg-gold text-white px-8 py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
            >
              Shop now
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {orders.map((order) => {
            const orderId = order.id ?? order.order_id;
            return (
            <div
              key={orderId}
              className="border border-cocoa/10 rounded-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-cocoa/60">
                  Order {order.order_number || `ORD-${orderId}`}
                </p>
                {Array.isArray(order.items) && order.items.length > 0 && (
                  <div className="mt-2 space-y-1 text-sm">
                    {order.items.map((item) => (
                      <p key={item.id ?? `${orderId}-${item.product_id}-${item.product_name}`}>
                        {item.product_name || `Product #${item.product_id}`} × {item.quantity}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-lg mt-1">
                  <span className="font-numeric">{formatPrice(order.total_amount)}</span>
                </p>
                <p className="text-xs text-cocoa/60 mt-1">
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-cocoa/60">
                  {order.status || "confirmed"}
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(orderId)}
                  disabled={downloadingInvoice === orderId}
                  className="text-xs uppercase tracking-widest text-gold hover:text-cocoa transition-colors disabled:opacity-60"
                >
                  {downloadingInvoice === orderId ? "Preparing…" : "Invoice ↓"}
                </button>
                <Link
                  to={`/order-confirmation?order_id=${orderId}`}
                  className="text-xs uppercase tracking-widest text-gold hover:text-cocoa transition-colors"
                >
                  View →
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
