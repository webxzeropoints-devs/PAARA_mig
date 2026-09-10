// /admin/dashboard — two panels: Products (CRUD + bestseller toggle + category
// dropdown) and Vault Card Selector (pin EXACTLY three products).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Edit, Save, Search, Trash2, Upload, Plus } from "lucide-react";

import {
  adminCreateCategory,
  adminCreateProduct,
  adminCreateShippingCity,
  adminDeleteCategory,
  adminDeleteProduct,
  adminDeleteShippingCity,
  adminListCategories,
  adminListProducts,
  adminListShippingCities,
  adminSetVault,
  adminUpdateCategory,
  adminUpdateProduct,
  adminUpdateShippingCity,
  toBoolean,
} from "../lib/api";

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

function Section({ title, subtitle, action, children }) {
  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-2xl tracking-[.12em] text-cocoa">{title}</h2>
          {subtitle && <p className="text-xs text-cocoa/60 mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="rounded-sm border border-cocoa/10 bg-shell">{children}</div>
    </section>
  );
}

export default function AdminDashboard() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [shippingCities, setShippingCities] = useState([]);
  const [editingShipping, setEditingShipping] = useState(null);
  const [shippingCreating, setShippingCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // product being edited in modal
  const [creating, setCreating] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryCreating, setCategoryCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, c, shipping] = await Promise.all([
        adminListProducts(),
        adminListCategories(),
        adminListShippingCities(),
      ]);
      
      setProducts(
        Array.isArray(p)
          ? p
          : Array.isArray(p?.products)
            ? p.products
            : []
      );
      
      setCategories(
        Array.isArray(c)
          ? c
          : Array.isArray(c?.categories)
            ? c.categories
            : []
      );

      setShippingCities(
        Array.isArray(shipping)
          ? shipping
          : Array.isArray(shipping?.cities)
            ? shipping.cities
            : []
      );
      
    } catch (err) {
      setError(err.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onToggleBestseller = async (product) => {
    try {
      await adminUpdateProduct(product.id, { is_bestseller: !product.is_bestseller });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const onChangeCategory = async (product, category_id) => {
    try {
      await adminUpdateProduct(product.id, { category_id: Number(category_id) });
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This is a hard delete.`)) return;
    try {
      await adminDeleteProduct(product.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCategoryDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}"? This will remove the category from the catalog.`)) return;
    try {
      await adminDeleteCategory(category.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShippingDelete = async (city) => {
  if (!window.confirm(`Delete shipping charge for "${city.name}"?`)) return;

  try {
    await adminDeleteShippingCity(city.id);
    reload();
  } catch (err) {
    setError(err.message);
  }
};

  const vaultIds = useMemo(
    () => products.filter((p) => toBoolean(p.is_vault)).sort(
      (a, b) => (a.vault_sort_order ?? 0) - (b.vault_sort_order ?? 0)
    ).map((p) => p.id),
    [products]
  );
  // fallback: any product flagged as vault even without sort_order
  const vaultFallback = useMemo(
    () => products.filter((p) => toBoolean(p.is_vault)).map((p) => p.id),
    [products]
  );
  const vaultSelection = vaultIds.length === 3 ? vaultIds : vaultFallback.slice(0, 3);

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[.28em] text-gold">Welcome back</p>
        <h1 className="font-display text-4xl text-cocoa mt-2">Dashboard</h1>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 border border-gold/40 text-cocoa text-sm rounded-sm bg-shell">
          {error}
        </div>
      )}

      <Section
        title="Manage The Vault"
        subtitle="Pin exactly three products that show in the homepage Vault strip."
      >
        <VaultSelector products={products} initialSelection={vaultSelection} onSaved={reload} />
      </Section>

      <Section
        title="Categories"
        subtitle="Create and manage product categories for the storefront."
        action={
          <button
            type="button"
            onClick={() => setCategoryCreating(true)}
            className="px-4 py-2 text-xs uppercase tracking-widest border border-gold/40 text-cocoa hover:bg-sand transition-colors"
          >
            + New category
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="font-display text-left text-xs uppercase tracking-[.18em] text-cocoa border-b border-gold/30">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-cocoa/10 odd:bg-sand/35 hover:bg-sand">
                  <td className="px-4 py-3 font-product-name text-cocoa">{category.name}</td>
                  <td className="px-4 py-3 text-cocoa/70">{category.slug}</td>
                  <td className="px-4 py-3 uppercase text-cocoa/70">{category.gender}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => setEditingCategory(category)} className="p-2 text-gold hover:bg-sand" aria-label="Edit category">
                        <Edit size={15} />
                      </button>
                      <button type="button" onClick={() => handleCategoryDelete(category)} className="p-2 text-cocoa hover:bg-sand" aria-label="Delete category">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-cocoa/60">
                    No categories yet. Create one to assign products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Shipping Charges"
        subtitle="Manage delivery charges by district or city."
        action={
          <button
            type="button"
            onClick={() => setShippingCreating(true)}
            className="px-4 py-2 text-xs uppercase tracking-widest border border-gold/40 text-cocoa hover:bg-sand transition-colors"
          >
            + Add district
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="font-display text-left text-xs uppercase tracking-[.18em] text-cocoa border-b border-gold/30">
              <tr>
                <th className="px-4 py-3">District / City</th>
                <th className="px-4 py-3">Delivery Charge</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
      
            <tbody>
              {shippingCities.map((city) => (
                <tr
                  key={city.id}
                  className="border-b border-cocoa/10 odd:bg-sand/35 hover:bg-sand"
                >
                  <td className="px-4 py-3 font-product-name text-cocoa">
                    {city.name}
                  </td>
      
                  <td className="px-4 py-3 text-cocoa/70">
                    ₹{Number(city.flat_shipping_rate).toFixed(2)}
                  </td>
      
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingShipping(city)}
                        className="p-2 text-gold hover:bg-sand"
                        aria-label="Edit shipping charge"
                      >
                        <Edit size={15} />
                      </button>
      
                      <button
                        type="button"
                        onClick={() => handleShippingDelete(city)}
                        className="p-2 text-cocoa hover:bg-sand"
                        aria-label="Delete shipping charge"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
      
              {shippingCities.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-10 text-center text-sm text-cocoa/60"
                  >
                    No shipping charges configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Products"
        subtitle={`${products.length} total · toggle bestseller, change category, edit, delete.`}
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa transition-colors"
          >
            + New product
          </button>
        }
      >
        {loading ? (
          <p className="p-6 text-sm text-cocoa/60">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-display text-left text-xs uppercase tracking-[.18em] text-cocoa border-b border-gold/30">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3 text-center">Bestseller</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-cocoa/10 odd:bg-sand/35 hover:bg-sand">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-sm overflow-hidden bg-sand border border-gold/25">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="leading-tight">
                          <p className="font-product-name text-cocoa">{product.name}</p>
                          <p className="text-[10px] uppercase tracking-[.14em] text-cocoa/50">{product.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={product.category_id}
                        onChange={(e) => onChangeCategory(product, e.target.value)}
                        className="bg-sand border border-cocoa/20 px-2 py-1 text-xs text-cocoa focus:outline-none focus:border-gold"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id} className="bg-shell">
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-cocoa font-numeric">₹{Number(product.price).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleBestseller(product)}
                        aria-pressed={toBoolean(product.is_bestseller)}
                        className={`inline-block h-5 w-9 rounded-full transition-colors ${toBoolean(product.is_bestseller) ? "bg-gold" : "bg-cocoa/15"}`}
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-shell transform transition-transform ${toBoolean(product.is_bestseller) ? "translate-x-4" : "translate-x-0.5"}`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          className="p-2 text-gold hover:bg-sand"
                          aria-label="Edit"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(product)}
                          className="p-2 text-cocoa hover:bg-sand"
                          aria-label="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-cocoa/60">
                      No products yet. Add one with the button above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

    <AnimatePresence>
      {(editing || creating) && (
        <ProductEditor
          product={editing}
          categories={categories}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}
    
      {(editingCategory || categoryCreating) && (
        <CategoryEditor
          category={editingCategory}
          onClose={() => { setEditingCategory(null); setCategoryCreating(false); }}
          onSaved={() => { setEditingCategory(null); setCategoryCreating(false); reload(); }}
        />
      )}
    
      {(editingShipping || shippingCreating) && (
        <ShippingEditor
          city={editingShipping}
          onClose={() => {
            setEditingShipping(null);
            setShippingCreating(false);
          }}
          onSaved={() => {
            setEditingShipping(null);
            setShippingCreating(false);
            reload();
          }}
        />
      )}
    </AnimatePresence>

      
      
    </div>
  );
}

function ShippingEditor({ city, onClose, onSaved }) {
  const isEdit = Boolean(city);

  const [form, setForm] = useState(() => ({
    name: city?.name || "",
    flat_shipping_rate:
      city?.flat_shipping_rate !== undefined
        ? String(city.flat_shipping_rate)
        : "",
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();

    const name = form.name.trim();
    const rate = Number(form.flat_shipping_rate);

    if (!name) {
      setError("District or city name is required.");
      return;
    }

    if (!Number.isFinite(rate) || rate < 0) {
      setError("Enter a valid delivery charge.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        name,
        flat_shipping_rate: rate,
      };

      if (isEdit) {
        await adminUpdateShippingCity(city.id, payload);
      } else {
        await adminCreateShippingCity(payload);
      }

      onSaved();
    } catch (err) {
      setError(err.message || "Could not save shipping charge.");
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
        className="bg-shell border border-gold/40 rounded-sm w-full max-w-lg"
      >
        <div className="px-6 py-4 border-b border-gold/25 flex items-center justify-between">
          <h3 className="font-display text-lg tracking-[.16em] text-cocoa">
            {isEdit ? "Edit shipping charge" : "Add shipping charge"}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="text-cocoa/60 hover:text-cocoa text-xs uppercase tracking-widest"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 border border-gold/40 text-cocoa text-sm rounded-sm bg-shell">
              {error}
            </div>
          )}

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">
              District / City
            </span>

            <input
              value={form.name}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  name: e.target.value,
                }))
              }
              placeholder="e.g. Thiruvallur"
              className="w-full border border-cocoa/15 bg-shell px-3 py-2.5 text-sm text-cocoa outline-none focus:border-gold"
              required
            />
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">
              Delivery Charge (₹)
            </span>

            <input
              type="number"
              min="0"
              step="0.01"
              value={form.flat_shipping_rate}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  flat_shipping_rate: e.target.value,
                }))
              }
              placeholder="e.g. 1"
              className="w-full border border-cocoa/15 bg-shell px-3 py-2.5 text-sm text-cocoa outline-none focus:border-gold"
              required
            />
          </label>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs uppercase tracking-widest border border-cocoa/15 text-cocoa hover:bg-sand"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs uppercase tracking-widest bg-cocoa text-shell hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CategoryEditor({ category, onClose, onSaved }) {
  const isEdit = Boolean(category);
  const [form, setForm] = useState(() => ({
    name: category?.name || "",
    slug: category?.slug || "",
    gender: category?.gender || "women",
    vibe: category?.vibe || "",
    material: category?.material || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        gender: form.gender,
        vibe: form.vibe.trim(),
        material: form.material.trim(),
      };

      if (!payload.name || !payload.slug || !["men", "women", "unisex"].includes(payload.gender)) {
        throw new Error("Name, slug, and gender are required.");
      }

      if (isEdit) await adminUpdateCategory(category.id, payload);
      else await adminCreateCategory(payload);
      onSaved();
    } catch (err) {
      setError(err.message || "Could not save category.");
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
        className="bg-shell border border-gold/40 rounded-sm w-full max-w-lg"
      >
        <div className="px-6 py-4 border-b border-gold/25 flex items-center justify-between">
          <h3 className="font-display text-lg tracking-[.16em] text-cocoa">
            {isEdit ? "Edit category" : "New category"}
          </h3>
          <button type="button" onClick={onClose} className="text-cocoa/60 hover:text-cocoa text-xs uppercase tracking-widest">Close</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Row>
            <Input label="Name" value={form.name} onChange={(value) => update("name", value)} required />
            <Input label="Slug" value={form.slug} onChange={(value) => update("slug", value)} required />
          </Row>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">Gender</span>
            <select
              value={form.gender}
              onChange={(e) => update("gender", e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            >
              <option value="women">Women</option>
              <option value="men">Men</option>
              <option value="unisex">Unisex</option>
            </select>
          </label>
          <Row>
            <Input label="Vibe" value={form.vibe} onChange={(value) => update("vibe", value)} />
            <Input label="Material" value={form.material} onChange={(value) => update("material", value)} />
          </Row>
          {error && <p className="text-sm text-cocoa">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60">
              {saving ? "Saving…" : isEdit ? "Save category" : "Create category"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Small elegant product card used inside the modal grid. Handles image fallback and
// visual states (hover, selected). Uses framer-motion variants so cards can be
// stagger-animated when the modal opens.
function ProductCard({ product, onSelect, isSelected }) {
  return (
    <motion.button
      layout
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 300, damping: 22, duration: 0.28 }}
      onClick={() => onSelect(product.id)}
      className={`relative h-full w-full min-w-0 text-left rounded-sm border ${isSelected ? "ring-2 ring-gold/50" : "border-gold/25"} bg-sand overflow-hidden transform transition-shadow duration-[...]`}
      aria-pressed={isSelected}
    >
      <div className="aspect-[4/5] bg-shell flex items-center justify-center">
        <ProductImage src={product.images?.[0]} alt={product.name} />
      </div>

      <div className="p-3">
        <div className="text-[10px] uppercase tracking-[.22em] font-display text-cocoa/60">PAARA. COLLECTION</div>
        <p className="mt-1 text-sm font-product-name text-cocoa truncate">{product.name}</p>
        <p className="mt-1 text-xs text-cocoa/60 font-numeric">₹{Number(product.price).toLocaleString("en-IN")}</p>
      </div>

      {isSelected && (
        <div className="absolute top-3 right-3 bg-gold text-sand rounded-full p-1 shadow-sm" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </motion.button>
  );
}

function ProductImage({ src, alt }) {
  const [imgError, setImgError] = useState(false);
  if (!src || imgError) return <ProductPlaceholder />;
  return <img src={src} alt={alt} onError={() => setImgError(true)} className="h-full w-full object-cover" />;
}

function ProductPlaceholder() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-sand text-gold/60">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
        <path d="M12 2l3 4 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1 3-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function VaultSelector({ products, initialSelection, onSaved }) {
  const [slots, setSlots] = useState(() => (initialSelection?.length === 3 ? initialSelection : [null, null, null]));
  const [pickerOpen, setPickerOpen] = useState(null); // index of slot being filled
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialSelection && initialSelection.length > 0) {
      setSlots((prev) => {
        if (prev.some((s) => s !== null)) return prev;
        return [
          initialSelection[0] || null,
          initialSelection[1] || null,
          initialSelection[2] || null,
        ];
      });
    }
  }, [initialSelection]);

  const filled = slots.filter(Boolean).length;

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !slots.includes(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, search, slots]);

  const choose = (slotIndex, productId) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = productId;
      return next;
    });
    setPickerOpen(null);
    setSearch("");
  };

  const save = async () => {
    setError("");
    if (filled !== 3) {
      setError("Pick exactly three products.");
      return;
    }
    if (new Set(slots).size !== 3) {
      setError("The three Vault products must be different.");
      return;
    }
    setSaving(true);
    try {
      await adminSetVault(slots);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // framer-motion variants for a subtle staggered reveal of cards
  const gridVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.04,
      },
    },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
  };

  return (
    <div className="p-5">
      <div className="grid sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((index) => {
          const productId = slots[index];
          const product = products.find((p) => p.id === productId);
          return (
            <div
              key={index}
              className={`relative aspect-[4/5] rounded-sm border ${product ? "border-gold/60" : "border-dashed border-gold/45"} bg-sand overflow-hidden`}
            >
              <span className="absolute top-2 left-2 text-[10px] uppercase tracking-[.18em] text-cocoa bg-shell/90 px-2 py-0.5 rounded-sm">
                Slot {index + 1}
              </span>
              {product ? (
                <>
                  {product.images?.[0] ? (
                    <ProductImage src={product.images[0]} alt={product.name} />
                  ) : <ProductPlaceholder />}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="font-product-name text-sm text-sand">{product.name}</p>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(index)}
                      className="px-2 py-1 text-[10px] uppercase tracking-[.14em] bg-shell/95 text-cocoa border border-gold/40 hover:bg-gold hover:text-sand"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => choose(index, null)}
                      className="px-2 py-1 text-[10px] uppercase tracking-[.14em] bg-shell/95 text-cocoa border border-gold/40 hover:bg-sand"
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(index)}
                  className="absolute inset-0 flex items-center justify-center text-gold hover:text-cocoa"
                >
                  <span className="text-xs uppercase tracking-[.22em]">+ Choose product</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs text-cocoa/60">
          {filled} of 3 filled
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || filled !== 3}
          className="flex items-center gap-2 px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving…" : "Save Vault"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-cocoa">{error}</p>}

      <AnimatePresence>
        {pickerOpen !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            onClick={() => setPickerOpen(null)}
            style={{ backgroundColor: 'rgba(20, 18, 17, 0.0)' }}
          >
            {/* backdrop fade handled by animate on child to avoid layout flicker */}
            <motion.div
              initial={{ backgroundColor: 'rgba(20,18,17,0)' }}
              animate={{ backgroundColor: 'rgba(20,18,17,0.38)' }}
              exit={{ backgroundColor: 'rgba(20,18,17,0)' }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="absolute inset-0"
            />

            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-shell border border-gold/40 rounded-sm w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gold/25">
                <Search size={16} className="text-gold" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="flex-1 bg-transparent outline-none text-cocoa placeholder-cocoa/40 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setPickerOpen(null)}
                  className="text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa"
                >
                  Close
                </button>
              </div>

              <motion.div
                className="min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
                variants={gridVariants}
                initial="hidden"
                animate="show"
              >
                {matching.map((product) => (
                  <motion.div key={product.id} variants={itemVariants} className="min-w-0 w-full">
                    <ProductCard
                      product={product}
                      onSelect={(id) => choose(pickerOpen, id)}
                      isSelected={slots[pickerOpen] === product.id}
                    />
                  </motion.div>
                ))}
                {matching.length === 0 && (
                  <p className="col-span-full text-center text-sm text-cocoa/60 py-12">
                    No matches.
                  </p>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductEditor({ product, categories, onClose, onSaved }) {
  const isEdit = Boolean(product);
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          category_id: product.category_id,
          name: product.name,
          slug: product.slug,
          description: product.description || "",
          price: product.price,
          material: product.material || "",
          subcategory: product.subcategory || "",
          stock: product.stock ?? 0,
          is_exclusive: toBoolean(product.is_exclusive),
          is_bestseller: toBoolean(product.is_bestseller),
          is_active: product.is_active === undefined ? true : toBoolean(product.is_active),
          release_date: (product.release_date || "").replace(" ", "T").slice(0, 16),
          images: product.images?.map(url => ({ url, file: null })) || [],
        }
      : {
          category_id: categories[0]?.id || "",
          name: "",
          slug: "",
          description: "",
          price: 0,
          material: "",
          subcategory: "",
          stock: 10,
          is_exclusive: false,
          is_bestseller: false,
          is_active: true,
          release_date: getLocalDateTimeInputValue(),
          images: [],
        }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const updateImage = (index, file) => {
    const images = [...form.images];
    images[index] = { file, url: URL.createObjectURL(file) };
    update("images", images);
  };

  const removeImage = (index) => update("images", form.images.filter((_, imageIndex) => imageIndex !== index));

  const moveImage = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= form.images.length) return;
    const images = [...form.images];
    [images[index], images[target]] = [images[target], images[index]];
    update("images", images);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("category_id", Number(form.category_id));
      formData.append("name", form.name);
      formData.append("slug", form.slug);
      formData.append("description", form.description);
      formData.append("price", Number(form.price));
      formData.append("material", form.material);
      formData.append("subcategory", form.subcategory);
      formData.append("stock", Number(form.stock));
      formData.append("is_exclusive", form.is_exclusive);
      formData.append("is_bestseller", form.is_bestseller);
      formData.append("is_active", form.is_active);
      formData.append("release_date", form.release_date ? new Date(form.release_date).toISOString() : new Date().toISOString());
      
      // Append image files
      form.images.forEach((image, index) => {
        if (image.file) {
          formData.append(`images`, image.file);
          formData.append("upload_slots", String(index));
        } else if (image.url) {
          // For existing images from edit mode, send as URL reference
          formData.append(`existingImages`, image.url);
          formData.append("existing_slots", String(index));
        }
      });

      if (isEdit) await adminUpdateProduct(product.id, formData);
      else await adminCreateProduct(formData);
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
        className="bg-shell border border-gold/40 rounded-sm w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-gold/25 flex items-center justify-between">
          <h3 className="font-display text-lg tracking-[.16em] text-cocoa">
            {isEdit ? "Edit product" : "New product"}
          </h3>
          <button type="button" onClick={onClose} className="text-cocoa/60 hover:text-cocoa text-xs uppercase tracking-widest">
            Close
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Row>
            <Input label="Name" value={form.name} onChange={(v) => update("name", v)} required />
            <Input label="Slug" value={form.slug} onChange={(v) => update("slug", v)} required />
          </Row>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">Category</span>
            <select
              value={form.category_id}
              onChange={(e) => update("category_id", e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-shell">
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
          </label>
          <Row>
            <Input label="Price (₹)" type="number" value={form.price} onChange={(v) => update("price", v)} required />
            <Input label="Stock" type="number" value={form.stock} onChange={(v) => update("stock", v)} />
          </Row>
          <Row>
            <Input label="Material" value={form.material} onChange={(v) => update("material", v)} />
            <Input label="Subcategory" value={form.subcategory} onChange={(v) => update("subcategory", v)} />
          </Row>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="block text-xs uppercase tracking-widest text-cocoa/60">Product images</span>
              <span className="text-[10px] uppercase tracking-widest text-gold">{form.images.filter(Boolean).length}/3</span>
            </div>
            <div className="space-y-3">
              {form.images.map((image, index) => (
                <div key={index} className="flex items-center gap-3 border border-cocoa/15 bg-sand p-2">
                  <div className="h-16 w-16 shrink-0 overflow-hidden bg-shell">
                    {image?.url ? <img src={image.url} alt={`Product preview ${index + 1}`} className="h-full w-full object-cover" /> : <ProductPlaceholder />}
                  </div>
                  <label className="min-w-0 flex-1 flex items-center gap-2 cursor-pointer">
                    <Upload size={14} className="text-cocoa/60 shrink-0" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => updateImage(index, e.target.files?.[0])}
                      className="hidden"
                    />
                    <span className="text-sm text-cocoa/60 truncate">
                      {image?.file?.name || "Click to upload image"}
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} className="px-1 text-xs text-cocoa/60 disabled:opacity-25" aria-label={`Move image up`}>
                      ↑
                    </button>
                    <button type="button" onClick={() => moveImage(index, 1)} disabled={index === form.images.length - 1} className="px-1 text-xs text-cocoa/60 disabled:opacity-25" aria-label={`Move image down`}>
                      ↓
                    </button>
                    <button type="button" onClick={() => removeImage(index)} className="px-1 text-xs uppercase tracking-widest text-cocoa/60 hover:text-cocoa" aria-label={`Remove image`}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => update("images", [...form.images, { file: null, url: null }])}
              disabled={form.images.length >= 3}
              className="mt-3 text-xs uppercase tracking-widest text-gold hover:text-cocoa disabled:cursor-not-allowed disabled:opacity-40"
            >
              {form.images.length >= 3 ? "3 image limit reached" : "+ Add image slot"}
            </button>
          </div>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">Release date</span>
            <input
              type="datetime-local"
              value={form.release_date}
              onChange={(e) => update("release_date", e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
          </label>
          <div className="flex gap-4 pt-2">
            <Toggle label="Bestseller" value={form.is_bestseller} onChange={(v) => update("is_bestseller", v)} />
            <Toggle label="Exclusive" value={form.is_exclusive} onChange={(v) => update("is_exclusive", v)} />
            <Toggle label="Active" value={form.is_active} onChange={(v) => update("is_active", v)} />
          </div>
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Row({ children }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Input({ label, type = "text", value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
        {...rest}
      />
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
