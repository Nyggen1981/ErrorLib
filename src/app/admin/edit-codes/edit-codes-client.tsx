"use client";

import { useState, useCallback } from "react";

type Brand = { name: string; slug: string };

type FaultCodeEntry = {
  id: string;
  code: string;
  title: string;
  description: string;
  fixSteps: string[];
  brandName: string;
  brandSlug: string;
  manualName: string;
  updatedAt: string;
};

export function EditCodesClient({ brands }: { brands: Brand[] }) {
  const [selectedBrand, setSelectedBrand] = useState("");
  const [search, setSearch] = useState("");
  const [codes, setCodes] = useState<FaultCodeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    fixSteps: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const fetchCodes = useCallback(
    async (brand: string, q: string) => {
      setLoading(true);
      setEditingId(null);
      setSaveMsg(null);
      try {
        const params = new URLSearchParams();
        if (brand) params.set("brand", brand);
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/admin/codes?${params}`);
        if (res.ok) {
          const data = await res.json();
          setCodes(data.codes);
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    },
    []
  );

  function handleBrandChange(slug: string) {
    setSelectedBrand(slug);
    fetchCodes(slug, search);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchCodes(selectedBrand, search);
  }

  function startEdit(code: FaultCodeEntry) {
    setEditingId(code.id);
    setEditForm({
      title: code.title,
      description: code.description,
      fixSteps: code.fixSteps.join("\n"),
    });
    setSaveMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveMsg(null);
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    setSaveMsg(null);

    try {
      const res = await fetch("/api/admin/codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: editForm.title,
          description: editForm.description,
          fixSteps: editForm.fixSteps
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCodes((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  title: editForm.title,
                  description: editForm.description,
                  fixSteps: editForm.fixSteps
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  updatedAt: data.updatedAt,
                }
              : c
          )
        );
        setSaveMsg("Saved");
        setTimeout(() => {
          setEditingId(null);
          setSaveMsg(null);
        }, 1200);
      } else {
        setSaveMsg("Failed to save");
      }
    } catch {
      setSaveMsg("Network error");
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-technical-900 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Edit Fault Codes</h1>
          <p className="mt-1 text-sm text-technical-400">
            Search, filter, and manually edit fault code entries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin"
            className="rounded-lg border border-technical-600 px-4 py-2 text-sm text-technical-300 transition hover:border-technical-400 hover:text-white"
          >
            Dashboard
          </a>
          <a
            href="/"
            className="rounded-lg border border-technical-600 px-4 py-2 text-sm text-technical-300 transition hover:border-technical-400 hover:text-white"
          >
            View Site
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <select
          value={selectedBrand}
          onChange={(e) => handleBrandChange(e.target.value)}
          className="rounded-lg border border-technical-600 bg-technical-800 px-4 py-2.5 text-sm text-white outline-none transition focus:border-accent"
        >
          <option value="">All Brands</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>

        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or title..."
            className="flex-1 rounded-lg border border-technical-600 bg-technical-800 px-4 py-2.5 text-sm text-white placeholder-technical-500 outline-none transition focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {loading ? (
        <div className="rounded-xl border border-technical-700 bg-technical-800 p-12 text-center">
          <p className="text-sm text-technical-400 animate-pulse">
            Loading fault codes...
          </p>
        </div>
      ) : codes.length === 0 ? (
        <div className="rounded-xl border border-technical-700 bg-technical-800 p-12 text-center">
          <p className="text-sm text-technical-500">
            {selectedBrand || search
              ? "No fault codes found. Try a different filter."
              : "Select a brand or search to load fault codes."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-technical-700 bg-technical-800">
          <div className="border-b border-technical-700 px-6 py-3">
            <p className="text-sm text-technical-400">
              {codes.length} fault code{codes.length !== 1 && "s"} found
            </p>
          </div>
          <div className="divide-y divide-technical-700/50">
            {codes.map((c) => (
              <div key={c.id} className="px-6 py-4">
                {editingId === c.id ? (
                  /* ── Edit form ── */
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-technical-700 px-2.5 py-1 font-mono text-sm font-bold text-accent">
                        {c.code}
                      </span>
                      <span className="text-xs text-technical-500">
                        {c.brandName} / {c.manualName}
                      </span>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-technical-400">
                        Title
                      </label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, title: e.target.value }))
                        }
                        className="w-full rounded-lg border border-technical-600 bg-technical-900 px-3 py-2 text-sm text-white outline-none transition focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-technical-400">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-technical-600 bg-technical-900 px-3 py-2 text-sm text-white outline-none transition focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-technical-400">
                        Fix Steps (one per line)
                      </label>
                      <textarea
                        rows={5}
                        value={editForm.fixSteps}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            fixSteps: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-technical-600 bg-technical-900 px-3 py-2 text-sm text-white outline-none transition focus:border-accent"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-success px-5 py-2 text-sm font-medium text-white transition hover:bg-success/80 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-lg border border-technical-600 px-5 py-2 text-sm text-technical-300 transition hover:border-technical-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      {saveMsg && (
                        <span
                          className={`text-sm font-medium ${saveMsg === "Saved" ? "text-success" : "text-danger"}`}
                        >
                          {saveMsg}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Read-only row ── */
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="rounded bg-technical-700 px-2 py-0.5 font-mono text-xs font-bold text-accent">
                          {c.code}
                        </span>
                        <span className="truncate font-medium text-technical-200">
                          {c.title}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-technical-400">
                        {c.description || "No description"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-technical-500">
                        <span>{c.brandName}</span>
                        <span className="text-technical-700">/</span>
                        <span className="truncate">{c.manualName}</span>
                        <span className="text-technical-700">·</span>
                        <span>{c.fixSteps.length} fix steps</span>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(c)}
                      className="shrink-0 rounded-lg border border-technical-600 px-4 py-2 text-xs font-medium text-technical-300 transition hover:border-accent hover:text-accent"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
