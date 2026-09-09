// /admin/coupons — list, create, edit, delete. Modal uses the same form for
// both create and edit modes.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Edit, Plus, Trash2 } from "lucide-react";

import {
  adminCreateCoupon,
  adminDeleteCoupon,
  adminListCoupons,
  adminUpdateCoupon,
  toBoolean,
} from "../lib/api";

const EMPTY = {
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
  // ISO datetime "YYYY-MM-DDTHH:mm:ss.sssZ" -> "YYYY-MM-DDTHH:mm"
  const s = iso.replace(" ", "T");
  return s.slice(0, 16);
}

function toIso(local) {
  if (!local) return "";
  return new Date(local).toISOString();
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // coupon object or 'new'

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await adminListCoupons();
      setCoupons(list || []);
    } catch (err) {
      setError(err.message || "Failed to load coupons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    try {
      await adminDeleteCoupon(coupon.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.28em] text-gold">Offers</p>
          <h1 className="font-display text-4xl text-cocoa mt-2">Coupons</h1>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa"
        >
          <Plus size={14} /> Add Coupon / Offer
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 border border-gold/40 text-cocoa text-sm rounded-sm bg-shell">
          {error}
        </div>
      )}

      <div className="rounded-sm border border-cocoa/10 bg-shell overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-cocoa/60">Loading…</p>
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
                      {new Date(coupon.deadline.replace(" ", "T")).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-[.14em] ${
                          toBoolean(coupon.is_active)
                            ? "bg-gold/20 text-cocoa"
                            : "bg-sand text-cocoa/45"
                        }`}
                      >
                        {toBoolean(coupon.is_active) ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(coupon)}
                          className="p-2 text-gold hover:bg-sand"
                          aria-label="Edit"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(coupon)}
                          className="p-2 text-cocoa hover:bg-sand"
                          aria-label="Delete"
                        >
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

      <AnimatePresence>
        {editing && (
          <CouponModal
            coupon={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); reload(); }}
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
      : EMPTY
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
      setError(err.message);
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
          <button type="button" onClick={onClose} className="text-cocoa/60 hover:text-cocoa text-xs uppercase tracking-widest">
            Close
          </button>
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
              placeholder="10% off across the store"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount type">
              <select
                value={form.discount_type}
                onChange={(e) => update("discount_type", e.target.value)}
                className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
              >
                <option value="percent" className="bg-shell">Percent (%)</option>
                <option value="flat" className="bg-shell">Flat (₹)</option>
              </select>
            </Field>
            <Field label="Discount value">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.discount_value}
                onChange={(e) => update("discount_value", e.target.value)}
                required
                className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
              />
            </Field>
          </div>
          <Field label="Deadline">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              required
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
          </Field>
          <Toggle label="Active" value={form.is_active} onChange={(v) => update("is_active", v)} />
          {error && <p className="text-sm text-cocoa">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create coupon"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="flex items-center gap-2 text-xs uppercase tracking-[.16em] text-cocoa/75"
    >
      <span className={`inline-block h-4 w-7 rounded-full transition-colors ${value ? "bg-gold" : "bg-cocoa/15"}`}>
        <span className={`block h-3 w-3 rounded-full bg-shell transform transition-transform mt-0.5 ${value ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}