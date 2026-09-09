import React, { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import AccountPageLayout from "./AccountPageLayout";
import { deleteAddress, getAddresses, postAddress, updateAddress } from "../../lib/api";
import { INDIAN_STATES, STATE_CITIES } from "../../lib/locations";

const emptyForm = { line1: "", line2: "", city: "", state: "", pincode: "" };

export default function Addresses() {
  const [addresses, setAddresses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    getAddresses()
      .then((data) => setAddresses(Array.isArray(data) ? data : data?.addresses || []))
      .catch((err) => setError(err.message || "Could not load saved addresses."));
  }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (address) => {
    setForm({
      line1: address.line1 || "",
      line2: address.line2 || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
    });
    setEditingId(address.id);
    setError("");
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const saved = editingId
        ? await updateAddress(editingId, { ...form, is_default: addresses.find((address) => address.id === editingId)?.is_default || false })
        : await postAddress({ ...form, is_default: addresses.length === 0 });
      setAddresses((prev) => [saved, ...prev.filter((address) => address.id !== saved.id)]);
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err.message || "Could not save address.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountPageLayout title="Saved Addresses" subtitle="Manage where your Paara pieces get delivered.">
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-gold text-white px-5 py-2.5 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors"
        >
          <Plus size={14} /> Add address
        </button>
      </div>
      <div className="flex shrink-0 gap-2">
        {!address.is_default && <button type="button" onClick={async () => {
          try {
            const updated = await updateAddress(address.id, {
              line1: address.line1,
              line2: address.line2 || "",
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              is_default: true,
            });
            setAddresses((prev) => prev.map((item) => ({ ...item, is_default: item.id === updated.id })));
          } catch (err) {
            setError(err.message || "Could not set default address.");
          }
        }} className="text-xs uppercase tracking-widest text-cocoa/60">
          Make default
        </button>}
        <button type="button" onClick={() => openEdit(address)} className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-gold">
          <Pencil size={13} /> Edit
        </button>
        <button type="button" onClick={async () => {
          if (!window.confirm("Delete this address?")) return;
          try {
            await deleteAddress(address.id);
            setAddresses((prev) => prev.filter((item) => item.id !== address.id));
          } catch (err) {
            setError(err.message || "Could not delete address.");
          }
        }} className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-red-700">
          <Trash2 size={13} /> Delete
        </button>
      </div>

      {addresses.length === 0 && !showForm && (
        <div className="bg-sand/60 border border-cocoa/10 rounded-sm p-10 text-center">
          <h2 className="font-display text-2xl mb-2">No saved addresses</h2>
          <p className="text-sm text-cocoa/60">Add an address so checkout is faster next time.</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="border border-cocoa/10 rounded-sm p-6 mb-6 bg-white/50 space-y-4">
          <Field label="Address line 1" value={form.line1} onChange={(v) => setForm({ ...form, line1: v })} required />
          <Field label="Address line 2" value={form.line2} onChange={(v) => setForm({ ...form, line2: v })} />
          <div className="grid md:grid-cols-3 gap-4">
            <SelectField label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v, city: "" })} options={INDIAN_STATES} required />
            <SelectField label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} options={STATE_CITIES[form.state] || []} required disabled={!form.state} />
            <Field label="Pincode" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="bg-gold text-white px-6 py-2.5 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors">
              {saving ? "Saving..." : "Save address"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="px-6 py-2.5 text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

      <div className="space-y-4">
        {addresses.map((address) => (
          <div key={address.id} className="border border-cocoa/10 rounded-sm p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              {address.is_default && <span className="text-[10px] uppercase tracking-widest bg-cocoa text-sand px-2 py-0.5 rounded-sm">Default</span>}
              <p className="text-sm text-cocoa/70 mt-1">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} - {address.pincode}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AccountPageLayout>
  );
}

function Field({ label, value, onChange, required = false }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm transition-colors"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required = false, disabled = false }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">{label}</label>
      <select required={required} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm transition-colors disabled:opacity-50">
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
