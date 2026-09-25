import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Edit, Plus, Trash2 } from "lucide-react";

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
    setLoyaltyError("");
    try {
      const settings = await adminRequest("/admin/loyalty-settings");
      setLoyaltyThreshold(String(settings?.reward_threshold ?? ""));
    } catch (err) {
      setLoyaltyError(err.message || "Could not load loyalty settings.");
    } finally {
      setLoadingLoyalty(false);
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
      await adminRequest("/admin/loyalty-settings", { method: "PUT", body: { reward_threshold } });
      await loadLoyaltyRules();
    } catch (err) {
      setLoyaltyError(err.message || "Could not save loyalty settings.");
    } finally {
      setLoyaltySaving(false);
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
            <p className="mt-2 text-sm text-cocoa/60">Set the combined item total required to earn one loyalty stamp.</p>
          </div>

          {loyaltyError && <p className="mb-5 border border-gold/40 bg-shell px-4 py-3 text-sm text-cocoa">{loyaltyError}</p>}

          <form onSubmit={handleLoyaltySubmit} className="mb-8 border border-cocoa/10 bg-shell p-5">
            <div className="grid gap-4 md:grid-cols-[13rem_auto] md:items-end">
              <label className="text-xs uppercase tracking-widest text-cocoa/60">
                Order threshold
                <input required min="0.01" step="0.01" type="number" value={loyaltyThreshold} onChange={(e) => setLoyaltyThreshold(e.target.value)} placeholder="₹ amount" className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-2 text-sm text-cocoa outline-none focus:border-gold" />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={loyaltySaving} className="bg-gold px-4 py-2 text-xs uppercase tracking-widest text-sand hover:bg-cocoa disabled:opacity-50">{loyaltySaving ? "Saving..." : "Save threshold"}</button>
              </div>
            </div>
          </form>
          <p className="text-sm text-cocoa/60">Every paid qualifying order earns one stamp when its combined eligible item total meets this amount.</p>
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
