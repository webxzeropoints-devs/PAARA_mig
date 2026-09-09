import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Filter, X } from "lucide-react";

import ProductFlipCard from "../../components/ProductFlipCard";
import { getCategories, getProducts } from "../../lib/api";
import { fadeUp, gridParent, childFadeUp } from "../../lib/motion";
import Seo from "../../components/Seo";

const MATERIALS = ["sterling_silver", "stainless_steel", "brass", "titanium"];
const VIBES = ["everyday", "festive", "minimal"];
const GENDERS = ["women", "men", "unisex"];
const SORTS = [
  { value: "popularity", label: "Sort by: Popularity" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

const normalizeList = (data) => (Array.isArray(data) ? data : data?.products || []);
const AUDIENCE_GENDERS = { "for-her": "women", "for-him": "men" };

export default function Collections() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDraft, setMobileDraft] = useState(null);

  const filters = useMemo(() => {
    const category = params.get("category") || "";
    const requestedGender = params.get("gender") || "";
    const audience = AUDIENCE_GENDERS[category] ? category : AUDIENCE_GENDERS[requestedGender] ? requestedGender : "";
    return {
      gender: audience ? AUDIENCE_GENDERS[audience] : requestedGender,
      material: params.get("material") || "",
      vibe: params.get("vibe") || "",
      category,
      subcategory: params.get("subcategory") || "",
      sort: params.get("sort") || "popularity",
      audience,
    };
  }, [params]);

  const apiFilters = useMemo(() => ({
    ...filters,
    category: filters.audience ? "" : filters.category,
  }), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getProducts(apiFilters)
      .then((data) => {
        if (cancelled) return;
        setProducts(normalizeList(data));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Could not load products");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiFilters]);

  useEffect(() => {
    getCategories().then((data) => setCategories(Array.isArray(data) ? data : [])).catch(() => setCategories([]));
  }, []);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const setCategory = (category) => {
    const next = new URLSearchParams(params);
    if (category) next.set("category", category);
    else next.delete("category");
    next.delete("subcategory");
    setParams(next, { replace: true });
  };

  const activeFilterCount = ["gender", "material", "vibe", "category", "subcategory"].filter((key) => filters[key]).length;
  const openMobileFilters = () => {
    setMobileDraft({ ...filters });
    setMobileFiltersOpen(true);
  };
  const closeMobileFilters = () => {
    setMobileFiltersOpen(false);
    setMobileDraft(null);
  };
  const applyMobileFilters = () => {
    const next = new URLSearchParams(params);
    ["gender", "material", "vibe", "category", "subcategory", "sort"].forEach((key) => {
      if (mobileDraft?.[key] && mobileDraft[key] !== (key === "sort" ? "popularity" : "")) next.set(key, mobileDraft[key]);
      else next.delete(key);
    });
    setParams(next, { replace: true });
    setMobileFiltersOpen(false);
    setMobileDraft(null);
  };
  const clearMobileFilters = () => {
    setParams({}, { replace: true });
    setMobileFiltersOpen(false);
    setMobileDraft(null);
  };

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-14">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="text-center mb-10"
        >
          <h1 className="font-display text-3xl md:text-4xl">Shop the collection</h1>
          <div className="w-16 h-px bg-gold mx-auto mt-3" />
        </motion.div>

        <div className="grid md:grid-cols-[220px_1fr] gap-10">
          {/* Filter rail */}
          <aside className="hidden md:block md:sticky md:top-24 h-fit border border-cocoa/10 rounded-sm p-5 bg-sand/60">
            <h2 className="text-xs uppercase tracking-widest text-cocoa/60 mb-3">Filters</h2>

            <FilterGroup
              label="Gender"
              value={filters.gender}
              options={GENDERS}
              onChange={(v) => setFilter("gender", v)}
            />
            <FilterGroup
              label="Material"
              value={filters.material}
              options={MATERIALS}
              onChange={(v) => setFilter("material", v)}
            />
            <FilterGroup
              label="Vibe"
              value={filters.vibe}
              options={VIBES}
              onChange={(v) => setFilter("vibe", v)}
            />
            <SelectFilter
              label="Collection"
              value={filters.category}
              options={categories}
              onChange={setCategory}
            />

            <div className="mt-4">
              <p className="text-xs uppercase tracking-widest text-cocoa/60 mb-2">Sort</p>
              <select
                value={filters.sort}
                onChange={(e) => setFilter("sort", e.target.value)}
                className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-1 text-sm font-semibold"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setParams({}, { replace: true })}
              className="mt-5 text-xs uppercase tracking-widest text-cocoa/50 hover:text-cocoa transition-colors"
            >
              Clear all
            </button>
          </aside>

          <section className="min-w-0">
            <div className="mb-5 flex gap-2 md:hidden">
              <button type="button" onClick={openMobileFilters} className="flex flex-1 items-center justify-between rounded-sm border border-cocoa/15 bg-sand/60 px-3 py-3 text-xs uppercase tracking-widest">
                <span className="flex items-center gap-2"><Filter size={15} aria-hidden="true" /> Filters</span>
                {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] text-white">{activeFilterCount}</span>}
              </button>
              <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)} aria-label="Sort products" className="min-w-0 flex-1 rounded-sm border border-cocoa/15 bg-sand/60 px-2 py-3 text-xs font-semibold outline-none">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label.replace("Sort by: ", "")}</option>)}
              </select>
            </div>
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-sm mb-6">
                {error}
              </div>
            )}

            {loading ? (
              <p className="text-sm text-cocoa/60">Loading pieces…</p>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-cocoa/60 mb-4">
                  {filters.category
                    ? "No products found in this collection."
                    : "Curating luxury pieces for this collection. Check back soon."}
                </p>
                <button
                  onClick={() => setParams({}, { replace: true })}
                  className="text-xs uppercase tracking-widest text-gold hover:text-cocoa transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <motion.div
                variants={gridParent}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-4 md:grid-cols-3"
              >
                {products.map((p, i) => (
                  <motion.div key={p.id || p.slug} variants={childFadeUp} className="min-w-0">
                    <ProductFlipCard product={p} index={i} navigateOnClick />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </section>
        </div>
      </div>
      {mobileFiltersOpen && mobileDraft && (
        <div className="fixed inset-0 z-50 flex items-end bg-cocoa/40 md:hidden" onClick={closeMobileFilters}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-shell p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl">Filters</h2>
              <button type="button" onClick={closeMobileFilters} aria-label="Close filters" className="rounded-full p-2 text-cocoa/60 hover:bg-sand">
                <X size={18} />
              </button>
            </div>
            <FilterGroup label="Gender" value={mobileDraft.gender} options={GENDERS} onChange={(value) => setMobileDraft((current) => ({ ...current, gender: value }))} />
            <FilterGroup label="Material" value={mobileDraft.material} options={MATERIALS} onChange={(value) => setMobileDraft((current) => ({ ...current, material: value }))} />
            <FilterGroup label="Vibe" value={mobileDraft.vibe} options={VIBES} onChange={(value) => setMobileDraft((current) => ({ ...current, vibe: value }))} />
            <SelectFilter
              label="Collection"
              value={mobileDraft.category}
              options={categories}
              onChange={(value) => setMobileDraft((current) => ({ ...current, category: value, subcategory: "" }))}
            />
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cocoa/60">Sort</p>
              <select value={mobileDraft.sort} onChange={(event) => setMobileDraft((current) => ({ ...current, sort: event.target.value }))} className="w-full border-b border-cocoa/30 bg-transparent py-2 text-sm font-semibold outline-none focus:border-gold">
                {SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
              </select>
            </div>
            <div className="mt-6 flex gap-3 border-t border-cocoa/10 pt-4">
              <button type="button" onClick={clearMobileFilters} className="flex-1 border border-cocoa/20 px-4 py-3 text-xs uppercase tracking-widest text-cocoa/70">Clear All</button>
              <button type="button" onClick={applyMobileFilters} className="flex-1 bg-gold px-4 py-3 text-xs uppercase tracking-widest text-white hover:bg-cocoa">Apply Filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, value, options, onChange }) {
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-widest text-cocoa/60 mb-2 font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`text-xs uppercase tracking-widest px-3 py-1 rounded-sm border transition-colors font-semibold ${
              value === opt
                ? "bg-cocoa text-sand border-cocoa"
                : "border-cocoa/20 text-cocoa/70 hover:border-cocoa/40"
            }`}
          >
            {opt.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cocoa/60">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-b border-cocoa/30 bg-transparent py-1 text-sm font-semibold outline-none focus:border-gold"
      >
        <option value="">All Collections</option>
        {options.map((option) => (
          <option key={option.id || option.slug} value={option.slug}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
