import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { adminRequest, updateOrderStatus } from "../lib/api";

const ORDER_STAGES = ["Order Confirmed", "Packed", "Shipped", "Delivered"];

const normalizeStatus = (status) => {
  const value = String(status || "").trim();
  if (value.toLowerCase() === "rejected") return "Rejected";
  if (ORDER_STAGES.includes(value)) return value;
  if (["pending", "paid", "failed", "cancelled"].includes(value)) return "Order Confirmed";
  if (value === "shipped") return "Shipped";
  if (value === "delivered") return "Delivered";
  return "Order Confirmed";
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [granting, setGranting] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [verifyingPayment, setVerifyingPayment] = useState(null);
  const [verifiedChecks, setVerifiedChecks] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    try {
      const nextOrders = await adminRequest("/admin/orders");
      if (requestVersion !== loadVersion.current) return;
      setOrders(nextOrders);
      setLastUpdated(new Date());
    }
    catch (err) { setError(err.message || "Could not load orders."); }
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 20000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const grant = async (order) => {
    setGranting(order.id);
    setError("");
    try { await adminRequest(`/admin/orders/${order.id}/grant-gift-card`, { method: "POST" }); await load(); }
    catch (err) { setError(err.message || "Could not grant loyalty card."); }
    finally { setGranting(null); }
  };

  const handleStatusChange = async (orderId, nextStatus) => {
    setUpdatingStatus(orderId);
    setError("");
    try {
      await updateOrderStatus(orderId, nextStatus);
      await load();
    } catch (err) {
      setError(err.message || "Could not update order status.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const verifyManualPayment = async (orderId) => {
    setVerifyingPayment(orderId);
    setError("");
    try {
      const result = await adminRequest(`/admin/orders/${orderId}/verify-manual-payment`, { method: "POST", body: { confirmed: true } });
      setOrders((current) => current.map((order) => (
        order.id === orderId
          ? { ...order, payment_status: result.payment_status || "verified", payment_verified_at: new Date().toISOString() }
          : order
      )));
      await load();
    } catch (err) {
      setError(err.message || "Could not verify manual payment.");
    } finally {
      setVerifyingPayment(null);
    }
  };

  const rejectManualPayment = async (orderId) => {
    setVerifyingPayment(orderId);
    setError("");
    try {
      await adminRequest(`/admin/orders/${orderId}/reject-manual-payment`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message || "Could not reject manual payment.");
    } finally {
      setVerifyingPayment(null);
    }
  };

  const getManualPaymentBadge = (order) => {
    if (order.payment_status === "verified") return "UPI — Verified";
    if (order.payment_status === "rejected") return "UPI — Payment failed";
    if (order.payment_method === "manual_upi") return "UPI — Awaiting Verification";
    return "UPI - Pending Verification";
  };

  const copyUtr = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op: clipboard is optional for the admin workflow
    }
  };

  return (
    <div className="max-w-7xl">
      <div className="mb-7">
        <p className="text-[10px] uppercase tracking-[.28em] text-gold">Fulfilment</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="mt-2 font-display text-4xl text-cocoa">Orders</h1>
            {lastUpdated && <span className="text-[10px] text-cocoa/45">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
          <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 border border-cocoa/20 bg-shell px-4 py-2 text-xs uppercase tracking-widest text-cocoa transition-colors hover:border-gold disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <p className="mt-2 text-sm text-cocoa/60">Review purchases and approve qualifying loyalty card grants.</p>
      </div>
      {error && <p className="mb-5 border border-gold/40 bg-shell px-4 py-3 text-sm text-cocoa">{error}</p>}
      <div className="w-full max-w-full overflow-x-auto border border-cocoa/10 bg-shell">
        <table className="w-full min-w-[1100px] table-fixed bg-shell text-sm">
          <colgroup><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[20%]" /></colgroup>
          <thead className="border-b border-gold/30 text-left font-display text-[10px] uppercase tracking-[.18em] text-cocoa"><tr><th className="px-3 py-3.5">Order ID</th><th className="px-3 py-3.5">Products</th><th className="px-3 py-3.5">Shipping Address</th><th className="px-3 py-3.5">Status</th><th className="px-3 py-3.5">Payment</th><th className="px-3 py-3.5 text-right">Amount</th><th className="px-3 py-3.5">Date</th><th className="px-3 py-3.5">Loyalty</th></tr></thead>
          <tbody>
            {orders.map((order) => {
              const currentStatus = normalizeStatus(order.status);
              const currentIndex = ORDER_STAGES.indexOf(currentStatus);
              const isRejected = currentStatus === "Rejected";
              const eligible = order.gift_card_eligible_amount !== null && order.gift_card_eligible_amount !== undefined;
              const granted = Boolean(order.gift_card_granted_at);
              const isManualUpiVerifying = order.payment_method === "manual_upi" && order.payment_status !== "verified";
              return <tr key={order.id} className="border-b border-cocoa/10 align-top odd:bg-sand/35">
                <td className="min-w-0 break-words px-3 py-6 text-cocoa"><p className="break-words font-semibold">{order.order_number || `ORD-${order.id}`}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-cocoa/50">Customer #{order.customer_id}</p></td>
                <td className="min-w-0 px-3 py-6 text-cocoa">{order.items?.length ? <ul className="space-y-1.5">{order.items.map((item, index) => <li key={`${item.product_name}-${index}`} className="break-words text-xs leading-relaxed">{item.product_name} <span className="whitespace-nowrap text-cocoa/60">× {item.quantity}</span></li>)}</ul> : <span className="text-xs text-cocoa/40">No products found</span>}</td>
                <td className="min-w-0 break-words px-3 py-6 text-xs leading-relaxed text-cocoa/75">
                  {order.shipping_line1 ? <p className="break-words">{order.shipping_line1}{order.shipping_line2 ? `, ${order.shipping_line2}` : ""}<br />{order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}{order.shipping_country ? `, ${order.shipping_country}` : ""}</p> : <span className="text-cocoa/40">Not available</span>}
                </td>
                <td className="min-w-0 px-3 py-6 text-cocoa/75">
                  <div className="flex flex-wrap gap-1.5">
                    {isRejected ? <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-red-700">Rejected</span> : ORDER_STAGES.map((stage, index) => {
                      const isCurrent = currentStatus === stage;
                      const isDone = index < currentIndex;
                      const isAllowed = index === currentIndex + 1;
                      const isLockedForManualUpi = stage === "Packed" && isManualUpiVerifying;
                      const isDisabled = isDone || !isAllowed || isLockedForManualUpi;

                      return (
                        <button
                          key={stage}
                          type="button"
                          disabled={isRejected || isDisabled || updatingStatus === order.id}
                          onClick={() => handleStatusChange(order.id, stage)}
                          className={`whitespace-nowrap rounded-full border px-1.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                            isCurrent
                              ? "border-gold bg-gold/15 text-cocoa"
                              : isDone
                                ? "border-gold/40 bg-gold/10 text-cocoa"
                                : "border-cocoa/20 bg-transparent text-cocoa/40"
                          } ${!isDisabled ? "hover:border-gold hover:text-cocoa" : "cursor-default"}`}
                        >
                          {stage}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="min-w-0 break-words px-3 py-6"><span className={`inline-block max-w-full break-words rounded-sm px-2 py-1 text-[10px] uppercase tracking-[.14em] ${order.payment_method === "cod" ? "bg-gold/20 text-cocoa" : order.payment_method === "manual_upi" ? order.payment_status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-cocoa/75" : "bg-cocoa/10 text-cocoa/70"}`}>{order.payment_method === "cod" ? "COD - Payment pending" : order.payment_method === "manual_upi" ? getManualPaymentBadge(order) : order.payment_status === "paid" ? "Paid online" : "Online pending"}</span>{order.payment_method === "manual_upi" && order.payment_reference && <div className="mt-2 space-y-1"><div className="flex items-center gap-2"><p className="truncate text-[10px] uppercase tracking-[.14em] text-cocoa/55">UTR: {order.payment_reference}</p><button type="button" onClick={() => copyUtr(order.payment_reference)} className="shrink-0 text-[9px] uppercase tracking-[.14em] text-gold hover:text-cocoa">Copy</button></div><p className="text-[10px] uppercase tracking-[.14em] text-cocoa/55">Amount: ₹{Number(order.total_amount).toLocaleString("en-IN")}</p></div>}</td>
                <td className="px-3 py-6 text-right font-semibold text-cocoa font-numeric">₹{Number(order.total_amount).toLocaleString("en-IN")}</td>
                <td className="px-3 py-6 text-cocoa/70">{new Date(order.created_at.replace(" ", "T") + "Z").toLocaleDateString()}</td>
                <td className="min-w-0 break-words px-3 py-6">{order.payment_method === "manual_upi" ? <div className="flex flex-col gap-1.5">{order.payment_status !== "verified" && <label className="flex items-center gap-2 text-[10px] leading-tight text-cocoa/70"><input type="checkbox" checked={Boolean(verifiedChecks[order.id])} onChange={(event) => setVerifiedChecks((current) => ({ ...current, [order.id]: event.target.checked }))} className="shrink-0 accent-gold" />I have verified this payment in my UPI/bank app.</label>}<button type="button" onClick={() => verifyManualPayment(order.id)} disabled={verifyingPayment === order.id || order.payment_status === "verified" || !verifiedChecks[order.id]} className="w-full min-w-[190px] whitespace-normal break-words bg-gold px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-sand hover:bg-cocoa disabled:opacity-50">{verifyingPayment === order.id ? "Confirming..." : order.payment_status === "verified" ? "Payment Verified ✓" : "Confirm & Unlock for Packing"}</button><button type="button" onClick={() => rejectManualPayment(order.id)} disabled={verifyingPayment === order.id} className="w-full min-w-[190px] whitespace-normal break-words border border-cocoa/20 px-2.5 py-1 text-[9px] uppercase tracking-[.12em] text-cocoa/70 hover:border-cocoa/40 disabled:opacity-50">Reject / Payment Not Received</button></div> : eligible ? granted ? <span className="text-xs uppercase tracking-widest text-gold">Loyalty card granted<br /><span className="normal-case tracking-normal text-cocoa/50">₹{Number(order.gift_card_eligible_amount).toLocaleString("en-IN")}</span></span> : <div><span className="inline-block max-w-full break-words bg-gold/20 px-2 py-1 text-[10px] uppercase tracking-widest text-cocoa">Eligible for loyalty card grant</span><p className="mt-1 text-xs text-cocoa/65">₹{Number(order.gift_card_eligible_amount).toLocaleString("en-IN")}</p><button type="button" onClick={() => grant(order)} disabled={granting === order.id} className="mt-2 bg-gold px-3 py-1.5 text-[10px] uppercase tracking-widest text-sand hover:bg-cocoa disabled:opacity-50">{granting === order.id ? "Granting..." : "Grant loyalty card"}</button></div> : <span className="text-xs text-cocoa/40">Not eligible</span>}</td>
              </tr>;
            })}
            {orders.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-cocoa/60">No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
