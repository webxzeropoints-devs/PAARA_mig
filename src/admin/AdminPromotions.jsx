import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Edit, ImageOff, Plus, Search, Trash2, X } from "lucide-react";

import {
  adminCreateCoupon,
  adminDeleteCoupon,
  adminListCoupons,
  adminRequest,
  adminUpdateCoupon,
  toBoolean,
} from "../lib/api";

const EMPTY_COUPON = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: "",
  deadline: "",
  is_active: true,
};

function formatDiscount(c) {
  if (!c) return "—";
  if (c.discount_type === "percent") return `${c.discount_value}% OFF`;
  return `₹${Number(c.discount_value).toLocaleString("en-IN")} OFF`;
}

function toLocalInput(iso) {
  if (!iso) return "";
  const s = String(iso).replace(" ", "T");
  return s.slice(0, 16);
}

function toIso(local) {
  if (!local) return "";
  return new Date(local).toISOString();
}

export default function AdminPromotions() {
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [loadingLoyalty, setLoadingLoyalty] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("coupons");

  const [couponEditor, setCouponEditor] = useState(null);
  const [loyaltyThreshold, setLoyaltyThreshold] = useState("");
  const [rewardProducts, setRewardProducts] = useState([]);
  const [eligibleCustomers, setEligibleCustomers] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [rewardPickerCustomer, setRewardPickerCustomer] = useState(null);
  const [savingRewardCustomer, setSavingRewardCustomer] = useState(null);
  const [rewardActionCustomer, setRewardActionCustomer] = useState(null);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState("");

  const loadCoupons = useCallback(async () => {
    setLoadingCoupons(true);
    setError("");
    try {
      const list = await adminListCoupons();
      setCoupons(list || []);
    } catch (err) {
      setError(err.message || "Failed to load coupons.");
    } finally {
      setLoadingCoupons(false);
    }
  }, []);

  const loadLoyaltyRules = useCallback(async () => {
    setLoadingLoyalty(true);
    setLoadingEligible(true);
    setLoyaltyError("");
    try {
      const results = await Promise.allSettled([
        adminRequest("/admin/loyalty-settings"),
        adminRequest("/admin/products"),
        adminRequest("/admin/loyalty-eligible"),
      ]);
      const errors = [];
      if (results[0].status === "fulfilled") {
        setLoyaltyThreshold(String(results[0].value?.reward_threshold ?? ""));
      } else {
        errors.push(results[0].reason?.message || "Could not load loyalty settings.");
      }
      if (results[1].status === "fulfilled") {
        setRewardProducts(Array.isArray(results[1].value) ? results[1].value : []);
      } else {
        errors.push(results[1].reason?.message || "Could not load reward products.");
      }
      if (results[2].status === "fulfilled") {
        setEligibleCustomers(Array.isArray(results[2].value) ? results[2].value : []);
      } else {
        errors.push(results[2].reason?.message || "Could not load eligible customers.");
      }
      setLoyaltyError(errors.join(" "));
    } finally {
      setLoadingLoyalty(false);
      setLoadingEligible(false);
    }
  }, []);

  useEffect(() => {
    loadCoupons();
    loadLoyaltyRules();
  }, [loadCoupons, loadLoyaltyRules]);

  const onCouponDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    try {
      await adminDeleteCoupon(coupon.id);
      await loadCoupons();
    } catch (err) {
      setError(err.message || "Could not delete coupon.");
    }
  };

  const handleLoyaltySubmit = async (event) => {
    event.preventDefault();
    setLoyaltySaving(true);
    setLoyaltyError("");
    try {
      const reward_threshold = Number(loyaltyThreshold);
      if (!Number.isFinite(reward_threshold) || reward_threshold <= 0) {
        throw new Error("Enter a valid loyalty threshold.");
      }
      await adminRequest("/admin/loyalty-settings", {
        method: "PUT",
        body: {
          reward_threshold,
        },
      });
      await loadLoyaltyRules();
    } catch (err) {
      setLoyaltyError(err.message || "Could not save loyalty settings.");
    } finally {
      setLoyaltySaving(false);
    }
  };

  const setCustomerReward = async (customerId, productId) => {
    setSavingRewardCustomer(customerId);
    setLoyaltyError("");
    try {
      await adminRequest(`/admin/loyalty-eligible/${customerId}/reward`, {
        method: "PUT",
        body: { reward_product_id: productId },
      });
      setRewardPickerCustomer(null);
      await loadLoyaltyRules();
    } catch (err) {
      setLoyaltyError(err.message || "Could not save this customer's gift.");
    } finally {
      setSavingRewardCustomer(null);
    }
  };

  const confirmCustomerReward = async (customerId) => {
    setRewardActionCustomer(customerId);
    setLoyaltyError("");
    try {
      await adminRequest(`/admin/loyalty-eligible/${customerId}/confirm-reward`, {
        method: "POST",
        body: {},
      });
      await loadLoyaltyRules();
    } catch (err) {
      setLoyaltyError(err.message || "Could not confirm this customer's reward.");
    } finally {
      setRewardActionCustomer(null);
    }
  };

  const retryCustomerRewardEmail = async (customerId) => {
    setRewardActionCustomer(customerId);
    setLoyaltyError("");
    try {
      await adminRequest(`/admin/loyalty-eligible/${customerId}/retry-email`, {
        method: "POST",
        body: {},
      });
      await loadLoyaltyRules();
    } catch (err) {
      setLoyaltyError(err.message || "Could not retry this reward email.");
    } finally {
      setRewardActionCustomer(null);
    }
  };

  const tabs = useMemo(() => [
    { key: "coupons", label: "Coupons" },
    { key: "loyalty", label: "Loyalty Card" },
  ], []);

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.28em] text-gold">Marketing</p>
          <h1 className="font-display text-4xl text-cocoa mt-2">Coupons &amp; Loyalty</h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 border border-gold/40 text-cocoa text-sm rounded-sm bg-shell">
          {error}
        </div>
      )}

      <div className="mb-6 border-b border-cocoa/10 bg-shell">
        <div className="flex flex-wrap gap-2 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-[11px] uppercase tracking-[.18em] transition-colors ${
                activeTab === tab.key
                  ? "bg-gold text-sand"
                  : "text-cocoa/65 hover:bg-sand hover:text-cocoa"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "coupons" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[.28em] text-gold">Offers</p>
              <h2 className="mt-2 font-display text-3xl text-cocoa">Coupons</h2>
            </div>
            <button
              type="button"
              onClick={() => setCouponEditor("new")}
              className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa"
            >
              <Plus size={14} /> Add Coupon / Offer
            </button>
          </div>

          <div className="rounded-sm border border-cocoa/10 bg-shell overflow-hidden">
            {loadingCoupons ? (
              <p className="p-6 text-sm text-cocoa/60">Loading coupons…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="font-display text-left text-xs uppercase tracking-[.18em] text-cocoa border-b border-gold/30">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Discount</th>
                      <th className="px-4 py-3">Deadline</th>
                      <th className="px-4 py-3 text-center">Active</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((coupon) => (
                      <tr key={coupon.id} className="border-b border-cocoa/10 odd:bg-sand/35 hover:bg-sand">
                        <td className="px-4 py-3 font-medium tracking-[.14em] text-gold">{coupon.code}</td>
                        <td className="px-4 py-3 text-cocoa/85">{coupon.description || "—"}</td>
                        <td className="px-4 py-3 text-cocoa font-numeric">{formatDiscount(coupon)}</td>
                        <td className="px-4 py-3 text-cocoa/85 whitespace-nowrap">
                          {coupon.deadline ? new Date(String(coupon.deadline).replace(" ", "T")).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-[.14em] ${toBoolean(coupon.is_active) ? "bg-gold/20 text-cocoa" : "bg-sand text-cocoa/45"}`}>
                            {toBoolean(coupon.is_active) ? "On" : "Off"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-2">
                            <button type="button" onClick={() => setCouponEditor(coupon)} className="p-2 text-gold hover:bg-sand" aria-label="Edit coupon">
                              <Edit size={15} />
                            </button>
                            <button type="button" onClick={() => onCouponDelete(coupon)} className="p-2 text-cocoa hover:bg-sand" aria-label="Delete coupon">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-cocoa/60">
                          No coupons yet. Click "Add Coupon / Offer" to create one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "loyalty" && (
        <div className="max-w-6xl">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-[.28em] text-gold">Customer rewards</p>
            <h2 className="mt-2 font-display text-3xl text-cocoa">Loyalty Card</h2>
            <p className="mt-2 text-sm text-cocoa/60">Set the earning rule, then choose a jewellery gift separately for each eligible customer.</p>
          </div>

          {loyaltyError && <p className="mb-5 border border-gold/40 bg-shell px-4 py-3 text-sm text-cocoa">{loyaltyError}</p>}

          <form onSubmit={handleLoyaltySubmit} className="mb-8 border border-cocoa/10 bg-shell p-5">
            <div className="grid gap-5 md:grid-cols-[13rem_1fr] md:items-end">
              <label className="text-xs uppercase tracking-widest text-cocoa/60">
                Qualifying order threshold
                <input required min="0.01" step="0.01" type="number" value={loyaltyThreshold} onChange={(e) => setLoyaltyThreshold(e.target.value)} placeholder="₹ amount" className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-2 text-sm text-cocoa outline-none focus:border-gold" />
              </label>
              <p className="text-xs leading-relaxed text-cocoa/65">Choose each eligible customer’s gift beside their name below. The gift assignment does not change the stamp threshold or earning rules.</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-cocoa/10 pt-4">
              <p className="max-w-2xl text-xs leading-relaxed text-cocoa/65">One stamp per paid qualifying non-COD order, including admin-verified manual payments. Customers need six stamps within six months. A claimed gift creates a ₹0 order with free delivery and standard order tracking.</p>
              <button type="submit" disabled={loyaltySaving || loadingLoyalty} className="bg-gold px-4 py-2 text-xs uppercase tracking-widest text-sand hover:bg-cocoa disabled:opacity-50">{loyaltySaving ? "Saving..." : "Save loyalty settings"}</button>
            </div>
          </form>

          <section className="border border-cocoa/10 bg-shell">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/25 px-5 py-4">
              <div>
                <h3 className="font-display text-2xl text-cocoa">Customer eligibility &amp; claims</h3>
                <p className="mt-1 text-xs text-cocoa/60">Assign a gift beside each eligible customer. Claimed gifts appear as normal orders for fulfilment.</p>
              </div>
              <button type="button" onClick={loadLoyaltyRules} disabled={loadingEligible} className="border border-cocoa/20 px-3 py-2 text-[10px] uppercase tracking-widest text-cocoa hover:border-gold disabled:opacity-50">{loadingEligible ? "Refreshing..." : "Refresh"}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-gold/25 text-left text-[10px] uppercase tracking-widest text-cocoa/60">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Stamps</th>
                    <th className="px-4 py-3">Gift for this customer</th>
                    <th className="px-4 py-3">Claim / delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleCustomers.map((customer) => {
                    const isEligible = Boolean(customer.reward_eligible);
                    const rewardStatus = customer.reward_claim_status
                      || (customer.reward_product_id ? "reward_selected" : "eligible");
                    const emailPending = rewardStatus === "email_pending";
                    const emailSent = rewardStatus === "email_sent";
                    const claimLinkExpired = emailSent
                      && Number.isFinite(new Date(customer.reward_claim_expires_at).getTime())
                      && new Date(customer.reward_claim_expires_at).getTime() <= Date.now();
                    const canRetryEmail = (emailPending && customer.reward_email_status === "failed")
                      || claimLinkExpired;
                    const claimed = rewardStatus === "claimed" || Boolean(customer.claim_order_id);
                    const rewardLocked = emailPending || emailSent || claimed;
                    return (
                      <tr key={customer.customer_id} className="border-b border-cocoa/10 odd:bg-sand/35">
                        <td className="px-4 py-3"><p className="font-medium text-cocoa">{customer.name}</p><p className="text-xs text-cocoa/55">{customer.email}</p></td>
                        <td className="px-4 py-3">{customer.stamp_count} / 6</td>
                        <td className="px-4 py-3">
                          {isEligible ? (
                            <RewardProductCard
                              product={rewardProducts.find((product) => String(product.id) === String(customer.reward_product_id))}
                              onChange={() => setRewardPickerCustomer({ customerId: customer.customer_id, selectedId: customer.reward_product_id ? String(customer.reward_product_id) : "" })}
                              onClear={() => setCustomerReward(customer.customer_id, null)}
                              saving={savingRewardCustomer === customer.customer_id}
                              locked={rewardLocked}
                            />
                          ) : (
                            <span className={`text-[10px] uppercase tracking-widest ${customer.claimed_at || customer.claim_order_id || customer.completed_at ? "text-cocoa/55" : "text-cocoa/40"}`}>{customer.claimed_at || customer.claim_order_id || customer.completed_at ? "Claimed" : "Collecting stamps"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {customer.claim_order_number ? (
                            <>
                              <span className="block font-medium text-cocoa">{customer.claimed_product_name || "Jewellery gift"}</span>
                              <span className="text-xs text-cocoa/60">{customer.claim_order_number} · {customer.claim_order_status || "Order Confirmed"}</span>
                            </>
                          ) : claimed ? (
                            <span className="text-xs text-cocoa/55">Claimed</span>
                          ) : isEligible ? (
                            <div className="space-y-2">
                              <span className="block text-xs text-cocoa/65">
                                {emailSent
                                  ? claimLinkExpired
                                    ? "Claim link expired · a fresh email can be sent"
                                    : `Email sent${customer.reward_claim_expires_at ? ` · claim by ${new Date(customer.reward_claim_expires_at).toLocaleDateString("en-IN")}` : ""}`
                                  : emailPending
                                    ? (customer.reward_email_status === "failed"
                                      ? `Email failed${customer.reward_email_error ? `: ${customer.reward_email_error}` : ""}`
                                      : "Reward selected · email queued")
                                    : rewardStatus === "reward_selected"
                                      ? "Waiting for owner confirmation"
                                      : "Awaiting reward selection"}
                              </span>
                              {rewardStatus === "reward_selected" && customer.reward_product_id && (
                                <button type="button" onClick={() => confirmCustomerReward(customer.customer_id)} disabled={rewardActionCustomer === customer.customer_id} className="bg-gold px-3 py-2 text-[10px] uppercase tracking-widest text-white hover:bg-cocoa disabled:opacity-50">
                                  {rewardActionCustomer === customer.customer_id ? "Confirming…" : "Confirm & send claim email"}
                                </button>
                              )}
                              {canRetryEmail && (
                                <button type="button" onClick={() => retryCustomerRewardEmail(customer.customer_id)} disabled={rewardActionCustomer === customer.customer_id} className="border border-gold px-3 py-2 text-[10px] uppercase tracking-widest text-cocoa hover:bg-gold/10 disabled:opacity-50">
                                  {rewardActionCustomer === customer.customer_id ? "Sending…" : claimLinkExpired ? "Renew claim link" : "Retry email"}
                                </button>
                              )}
                              {customer.reward_email_sent_at && <span className="block text-[10px] text-cocoa/50">Sent {new Date(customer.reward_email_sent_at).toLocaleString("en-IN")}</span>}
                            </div>
                          ) : customer.claimed_at ? (
                            <span className="text-xs text-cocoa/40">Claimed order record unavailable</span>
                          ) : (
                            <span className="text-xs text-cocoa/40">Collecting stamps</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingEligible && eligibleCustomers.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-cocoa/60">No loyalty customers yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <AnimatePresence>
        {couponEditor && (
          <CouponModal
            coupon={couponEditor === "new" ? null : couponEditor}
            onClose={() => setCouponEditor(null)}
            onSaved={async () => {
              setCouponEditor(null);
              await loadCoupons();
            }}
          />
        )}
      </AnimatePresence>
      {rewardPickerCustomer && (
        <RewardProductPicker
          products={rewardProducts.filter((product) => toBoolean(product.is_active))}
          selectedId={rewardPickerCustomer.selectedId}
          onChoose={(productId) => {
            setCustomerReward(rewardPickerCustomer.customerId, productId);
          }}
          onClose={() => setRewardPickerCustomer(null)}
        />
      )}
    </div>
  );
}

function RewardProductCard({ product, onChange, onClear, saving, locked }) {
  return (
    <div className="flex items-center gap-3 border border-gold/40 bg-sand p-2">
      <div className="grid h-12 w-12 shrink-0 place-items-center bg-shell">
        {product?.images?.[0] ? <img src={product.images[0]} alt="" className="h-full w-full object-cover" /> : <ImageOff size={17} className="text-cocoa/40" />}
      </div>
      <div className="min-w-0">
        <p className="max-w-[15rem] truncate font-product-name text-sm text-cocoa">{product?.name || "No gift selected"}</p>
        <p className="text-[10px] text-cocoa/55">{product ? `Stock: ${product.stock}` : "Choose a gift for this customer"}</p>
      </div>
      {!locked && <button type="button" onClick={onChange} disabled={saving} className="text-[10px] uppercase tracking-widest text-gold hover:text-cocoa disabled:opacity-50">{product ? "Change" : "Choose gift"}</button>}
      {product && !locked && <button type="button" onClick={onClear} disabled={saving} className="p-1 text-cocoa/50 hover:text-cocoa disabled:opacity-50" aria-label="Clear reward product"><X size={15} /></button>}
      {saving && <span className="text-[10px] text-cocoa/55">Saving…</span>}
    </div>
  );
}

function RewardProductPicker({ products, selectedId, onChoose, onClose }) {
  const [search, setSearch] = useState("");
  const matching = products.filter((product) =>
    !search ||
    product.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    product.slug.toLowerCase().includes(search.trim().toLowerCase())
  ).slice(0, 40);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-cocoa/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-gold/30 bg-shell shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-cocoa/10 p-4">
          <div><p className="text-[10px] uppercase tracking-[.2em] text-gold">Loyalty gift</p><h3 className="mt-1 font-display text-2xl text-cocoa">Choose jewellery</h3></div>
          <button type="button" onClick={onClose} className="p-2 text-cocoa/55 hover:text-cocoa" aria-label="Close product picker"><X size={18} /></button>
        </div>
        <label className="m-4 flex items-center gap-2 border border-cocoa/20 bg-sand px-3">
          <Search size={15} className="text-cocoa/45" />
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products..." className="w-full bg-transparent py-2 text-sm outline-none" />
        </label>
        <div className="overflow-y-auto px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {matching.map((product) => (
              <button key={product.id} type="button" onClick={() => onChoose(product.id)} className={`flex items-center gap-3 border p-2 text-left transition-colors ${String(product.id) === selectedId ? "border-gold bg-gold/10" : "border-cocoa/10 bg-sand hover:border-gold/50"}`}>
                <div className="grid h-14 w-14 shrink-0 place-items-center bg-shell">{product.images?.[0] ? <img src={product.images[0]} alt="" className="h-full w-full object-cover" /> : <ImageOff size={18} className="text-cocoa/40" />}</div>
                <div className="min-w-0"><p className="truncate font-product-name text-sm text-cocoa">{product.name}</p><p className="mt-1 text-[10px] text-cocoa/55">Stock: {product.stock}</p></div>
                {String(product.id) === selectedId && <span className="ml-auto text-[9px] uppercase tracking-widest text-gold">Selected</span>}
              </button>
            ))}
            {matching.length === 0 && <p className="col-span-full py-10 text-center text-sm text-cocoa/60">No active products found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CouponModal({ coupon, onClose, onSaved }) {
  const isEdit = Boolean(coupon);
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          code: coupon.code,
          description: coupon.description || "",
          discount_type: coupon.discount_type,
          discount_value: String(coupon.discount_value),
          deadline: toLocalInput(coupon.deadline),
          is_active: toBoolean(coupon.is_active),
        }
      : EMPTY_COUPON
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        deadline: toIso(form.deadline),
        is_active: form.is_active,
      };
      if (isEdit) await adminUpdateCoupon(coupon.id, payload);
      else await adminCreateCoupon(payload);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save coupon.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-cocoa/30 flex items-center justify-center p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-shell border border-gold/40 rounded-sm w-full max-w-md overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gold/25 flex items-center justify-between">
          <h3 className="font-display text-lg tracking-[.16em] text-cocoa">
            {isEdit ? "Edit coupon" : "New coupon"}
          </h3>
          <button type="button" onClick={onClose} className="text-cocoa/60 hover:text-cocoa text-xs uppercase tracking-widest">Close</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Field label="Code (auto-upper)">
            <input
              type="text"
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              required
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm uppercase tracking-[.14em] focus:outline-none focus:border-gold"
              placeholder="PAARA10"
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
              placeholder="Optional offer text"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.discount_type} onChange={(e) => update("discount_type", e.target.value)} className="w-full border-b border-cocoa/30 bg-transparent py-2 text-sm focus:outline-none focus:border-gold">
                <option value="percent">Percent</option>
                <option value="flat">Flat amount</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                type="number"
                value={form.discount_value}
                min="1"
                step="0.01"
                onChange={(e) => update("discount_value", e.target.value)}
                required
                className="w-full border-b border-cocoa/30 bg-transparent py-2 text-sm focus:outline-none focus:border-gold"
              />
            </Field>
          </div>
          <Field label="Deadline">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              required
              className="w-full border-b border-cocoa/30 bg-transparent py-2 text-sm focus:outline-none focus:border-gold"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-cocoa/70">
            <input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} className="accent-gold" />
            Active
          </label>
          {error && <p className="text-sm text-cocoa">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa">Cancel</button>
            <button type="submit" disabled={saving} className="bg-gold px-5 py-2 text-xs uppercase tracking-widest text-sand hover:bg-cocoa disabled:opacity-60">{saving ? "Saving..." : isEdit ? "Update" : "Create"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs uppercase tracking-widest text-cocoa/60">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
