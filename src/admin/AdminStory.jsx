import { useCallback, useEffect, useState } from "react";
import { adminGetStory, adminUpdateStory } from "../lib/api";

export default function AdminStory() {
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const row = await adminGetStory();
      setForm({
        title: row?.title || "",
        description: row?.description || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaved("");

    if (!form.title.trim() || !form.description.trim()) {
      setError("Title and description are required.");
      return;
    }

    try {
      await adminUpdateStory({
        title: form.title,
        description: form.description,
      });
      await load();
      setSaved("Saved.");
      setTimeout(() => setSaved(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl text-cocoa mb-2">PAARA Story</h1>
      <p className="mb-6 text-sm text-cocoa/65">Manage the story and mission content displayed on the About page.</p>

      {error && (
        <p className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {saved && (
        <p className="mb-4 border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {saved}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-cocoa/60">Loading...</p>
      ) : (
        <form onSubmit={save} className="border border-cocoa/10 bg-shell p-5 space-y-5">
          <section className="space-y-3">
            <div>
              <h2 className="font-display text-2xl text-cocoa">Story Title</h2>
              <p className="mt-1 text-sm text-cocoa/60">
                This is the main heading for the PAARA Story page.
              </p>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-cocoa">Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                className="mt-2 block w-full border border-cocoa/25 bg-sand px-3 py-2 text-sm normal-case outline-none focus:border-gold"
                placeholder="Enter story title"
              />
              <span className="mt-1 text-xs text-cocoa/50">
                {form.title.length}/200 characters
              </span>
            </label>
          </section>

          <section className="space-y-3 border-t border-cocoa/10 pt-6">
            <div>
              <h2 className="font-display text-2xl text-cocoa">Story Description</h2>
              <p className="mt-1 text-sm text-cocoa/60">
                This is the full story content. Line breaks will be preserved. Include the founder quote if desired.
              </p>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-cocoa">Description / Content</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={12}
                className="mt-2 block w-full border border-cocoa/25 bg-sand px-3 py-2 text-sm normal-case outline-none focus:border-gold font-body"
                placeholder="Enter the complete story content (supports multiple paragraphs)"
              />
              <span className="mt-1 text-xs text-cocoa/50">
                {form.description.length} characters
              </span>
            </label>
          </section>

          <div className="flex items-center gap-3 pt-3">
            <button
              type="submit"
              className="px-4 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-gold/90 transition-colors"
            >
              Save changes
            </button>
            {saved && <span className="text-sm text-cocoa">{saved}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
