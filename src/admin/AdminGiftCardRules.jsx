import { useCallback, useEffect, useState } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";
import { adminRequest, toBoolean } from "../lib/api";

const EMPTY = { product_id: "", gift_card_value: "", is_active: true };

export default function AdminGiftCardRules() {
  const [products, setProducts] = useState([]);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productList, ruleList] = await Promise.all([
        adminRequest("/admin/products"),
        adminRequest("/admin/gift-card-rules"),
      ]);
      setProducts(productList || []);
      setRules(ruleList || []);
    } catch (err) {
      setError(err.message || "Could not load loyalty card rules.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(EMPTY); setEditingId(null); };
  const edit = (rule) => setForm({
    product_id: String(rule.product_id),
    gift_card_value: String(rule.gift_card_value),
    is_active: toBoolean(rule.is_active),
  }) || setEditingId(rule.id);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        product_id: Number(form.product_id),
        gift_card_value: Number(form.gift_card_value),
        is_active: form.is_active,
      };
      if (editingId) await adminRequest(`/admin/gift-card-rules/${editingId}`, { method: "PUT", body: payload });
      else await adminRequest("/admin/gift-card-rules", { method: "POST", body: payload });
      reset();
      await load();
    } catch (err) {
      setError(err.message || "Could not save gift card rule.");
    } finally { setSaving(false); }
  };

  const remove = async (rule) => {
    if (!window.confirm(`Delete the gift card rule for ${rule.product_name}?`)) return;
    try { await adminRequest(`/admin/gift-card-rules/${rule.id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err.message || "Could not delete gift card rule."); }
  };

  const toggle = async (rule) => {
    try {
      await adminRequest(`/admin/gift-card-rules/${rule.id}`, { method: "PUT", body: {
        product_id: rule.product_id,
        gift_card_value: rule.gift_card_value,
        is_active: !toBoolean(rule.is_active),
      } });
      await load();
    } catch (err) { setError(err.message || "Could not update gift card rule."); }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[.28em] text-gold">Customer rewards</p>
        <h1 className="mt-2 font-display text-4xl text-cocoa">Loyalty Card Rules</h1>
        <p className="mt-2 text-sm text-cocoa/60">Configure rewards for qualifying products. Grants are approved per order.</p>
      </div>
      {error && <p className="mb-5 border border-gold/40 bg-shell px-4 py-3 text-sm text-cocoa">{error}</p>}

      <form onSubmit={submit} className="mb-8 border border-cocoa/10 bg-shell p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl text-cocoa">{editingId ? "Edit rule" : "New rule"}</h2>
          {!editingId && <Plus size={18} className="text-gold" />}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_13rem_auto] md:items-end">
          <label className="text-xs uppercase tracking-widest text-cocoa/60">
            Product
            <select required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-2 text-sm text-cocoa outline-none focus:border-gold">
              <option value="">Select a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-cocoa/60">
            Loyalty value
            <input required min="1" step="0.01" type="number" value={form.gift_card_value} onChange={(e) => setForm({ ...form, gift_card_value: e.target.value })} placeholder="₹ value" className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-2 text-sm text-cocoa outline-none focus:border-gold" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-gold px-4 py-2 text-xs uppercase tracking-widest text-sand hover:bg-cocoa disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save" : "Create"}</button>
            {editingId && <button type="button" onClick={reset} className="border border-cocoa/20 px-4 py-2 text-xs uppercase tracking-widest text-cocoa/70">Cancel</button>}
          </div>
        </div>
      </form>

      <div className="overflow-x-auto border border-cocoa/10 bg-shell">
        <table className="w-full text-sm">
          <thead className="border-b border-gold/30 text-left font-display text-xs uppercase tracking-[.18em] text-cocoa"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {rules.map((rule) => <tr key={rule.id} className="border-b border-cocoa/10 odd:bg-sand/35">
              <td className="px-4 py-3 font-product-name text-cocoa">{rule.product_name}</td>
              <td className="px-4 py-3 text-cocoa font-numeric">₹{Number(rule.gift_card_value).toLocaleString("en-IN")}</td>
              <td className="px-4 py-3 text-xs uppercase tracking-widest text-cocoa/60">{toBoolean(rule.is_active) ? "Active" : "Inactive"}</td>
              <td className="px-4 py-3 text-right"><div className="inline-flex gap-2"><button type="button" onClick={() => toggle(rule)} className="px-2 py-1 text-[10px] uppercase tracking-widest text-gold">{toBoolean(rule.is_active) ? "Deactivate" : "Activate"}</button><button type="button" onClick={() => { setEditingId(rule.id); setForm({ product_id: String(rule.product_id), gift_card_value: String(rule.gift_card_value), is_active: toBoolean(rule.is_active) }); }} className="p-2 text-gold" aria-label="Edit rule"><Edit size={15}/></button><button type="button" onClick={() => remove(rule)} className="p-2 text-cocoa" aria-label="Delete rule"><Trash2 size={15}/></button></div></td>
            </tr>)}
            {rules.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-cocoa/60">No loyalty card rules yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
