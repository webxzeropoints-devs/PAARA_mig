import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Truck } from "lucide-react";

import AccountPageLayout from "./AccountPageLayout";
import { getOrderStatus } from "../../lib/api";

const STAGES = ["Order Confirmed", "Packed", "Shipped", "Delivered"];

export default function TrackOrder() {
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(() => searchParams.get("order") || "");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmed = orderNumber.trim();
    const trimmedEmail = email.trim();
    if (!trimmed || !trimmedEmail) {
      setError("Please enter your order ID and email.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await getOrderStatus(trimmed, trimmedEmail);
      setResult({
        orderNumber: trimmed,
        status: data.status || "Order Confirmed",
        message: data.message || "",
      });
    } catch (err) {
      setError(err.message || "Order not found.");
    } finally {
      setLoading(false);
    }
  };

  const currentStageIndex = Math.max(
    0,
    Math.min(STAGES.length - 1, STAGES.indexOf(result?.status || "Order Confirmed"))
  );

  return (
    <AccountPageLayout title="Track Order" subtitle="Enter your order number to see its delivery status.">
      <form onSubmit={onSubmit} className="max-w-xl flex flex-col gap-4 mb-12 sm:flex-row sm:items-end">
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Order ID"
          aria-label="Order ID"
          className="flex-1 bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm transition-colors"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email used for the order"
          aria-label="Email used for the order"
          className="flex-1 bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm transition-colors"
        />
        <button type="submit" className="bg-gold text-white px-6 py-2.5 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors">
          {loading ? "Tracking..." : "Track Order"}
        </button>
      </form>

      {error && (
        <div className="mb-8 max-w-md rounded-sm border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-cocoa">
          {error}
        </div>
      )}

      {result && (
        <div className="border border-cocoa/10 rounded-sm p-8 bg-white/40 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-cocoa/60 mb-8">Order #{result.orderNumber}</p>
          <div className="relative">
            <div className="absolute left-0 right-0 top-5 h-px bg-cocoa/15" aria-hidden="true" />
            <div
              className="absolute top-5 left-0 h-px bg-gold transition-all duration-500 ease-out"
              style={{ width: `${(currentStageIndex / (STAGES.length - 1)) * 100}%` }}
              aria-hidden="true"
            />
            <div className="relative z-10 flex items-start justify-between gap-4">
              {STAGES.map((stage, index) => {
                const isDone = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                return (
                  <div key={stage} className="relative flex-1 text-center">
                    <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                      isDone || isCurrent ? "border-gold bg-gold text-white" : "border-cocoa/20 bg-sand text-cocoa/40"
                    }`}>
                      {isDone ? <Check size={16} /> : <span className="text-xs font-medium">{index + 1}</span>}
                    </div>
                    <p className={`text-[10px] uppercase tracking-[0.22em] ${isDone || isCurrent ? "text-cocoa" : "text-cocoa/40"}`}>
                      {stage}
                    </p>
                  </div>
                );
              })}
            </div>
            <div
              className="absolute top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-gold bg-sand text-gold shadow-[0_0_0_6px_rgba(198,160,94,0.08)] transition-all duration-500 ease-out"
              style={{ left: `calc(${(currentStageIndex / (STAGES.length - 1)) * 100}% - 1rem)` }}
              aria-label={`Current shipment stage: ${result.status}`}
            >
              <Truck size={16} />
            </div>
          </div>

          {result.message && (
            <p className="mt-10 text-sm text-cocoa/70">{result.message}</p>
          )}
        </div>
      )}
    </AccountPageLayout>
  );
}
