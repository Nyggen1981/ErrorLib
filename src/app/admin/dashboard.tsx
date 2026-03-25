"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";

type MiningLogEntry = {
  id: string;
  brand: string;
  manual: string;
  codesFound: number;
  pagesUsed: number;
  durationMs: number;
  status: string;
  message: string | null;
  createdAt: string;
};

type QueueEntry = {
  id: string;
  brandName: string;
  status: string;
  createdAt: string;
};

type UserRequestEntry = {
  id: string;
  brand: string;
  model: string | null;
  status: string;
  voteCount: number;
  createdAt: string;
};

type Props = {
  stats: {
    brandCount: number;
    manualCount: number;
    faultCount: number;
  };
  brandStats: {
    name: string;
    slug: string;
    manuals: number;
    faultCodes: number;
  }[];
  recentActivity: {
    id: string;
    code: string;
    title: string;
    brandName: string;
    manualName: string;
    createdAt: string;
  }[];
  miningLogs: MiningLogEntry[];
  queue: QueueEntry[];
  userRequests: UserRequestEntry[];
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
      <p className="text-sm font-medium text-technical-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    success: "bg-success/20 text-success",
    empty: "bg-warning/20 text-warning",
    failed: "bg-danger/20 text-danger",
    started: "bg-accent/20 text-accent animate-pulse",
    skipped: "bg-technical-500/20 text-technical-400",
    aborted: "bg-danger/10 text-technical-400",
  };
  const labels: Record<string, string> = {
    started: "in progress",
    skipped: "skipped",
    aborted: "aborted",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-technical-600 text-technical-300"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function queueStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-warning/20 text-warning",
    processing: "bg-accent/20 text-accent animate-pulse",
    completed: "bg-success/20 text-success",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-technical-600 text-technical-300"}`}
    >
      {status}
    </span>
  );
}

function MiningQueuePanel({ initialQueue }: { initialQueue: QueueEntry[] }) {
  const [queue, setQueue] = useState<QueueEntry[]>(initialQueue);
  const [brandInput, setBrandInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/queue");
      if (res.ok) {
        const data = await res.json();
        setQueue(data.items);
      }
    } catch {}
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = brandInput.trim();
    if (!name) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add brand");
      } else {
        setBrandInput("");
        await refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/admin/queue?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setQueue((prev) => prev.filter((q) => q.id !== id));
      }
    } catch {}
  }

  const activeItems = queue.filter(
    (q) => q.status === "pending" || q.status === "processing"
  );
  const completedItems = queue.filter((q) => q.status === "completed");

  return (
    <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Mining Queue</h2>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          type="text"
          value={brandInput}
          onChange={(e) => setBrandInput(e.target.value)}
          placeholder="Brand name (e.g. Mitsubishi)"
          className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-3 py-2 text-sm text-white placeholder-technical-500 outline-none transition focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || !brandInput.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/80 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add Brand"}
        </button>
      </form>

      {error && (
        <p className="mb-3 text-sm text-danger">{error}</p>
      )}

      {activeItems.length > 0 ? (
        <div className="space-y-2">
          {activeItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-technical-700 bg-technical-900 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {queueStatusBadge(item.status)}
                <span className="font-medium text-technical-200">
                  {item.brandName}
                </span>
                <span className="text-xs text-technical-500">
                  {timeAgo(item.createdAt)}
                </span>
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="rounded px-2 py-1 text-xs text-technical-400 transition hover:bg-danger/20 hover:text-danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-technical-500">
          Queue is empty. Add a brand above to start mining.
        </p>
      )}

      {completedItems.length > 0 && (
        <div className="mt-4 border-t border-technical-700 pt-3">
          <p className="mb-2 text-xs font-medium text-technical-400">
            Recently completed
          </p>
          <div className="space-y-1">
            {completedItems.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  {queueStatusBadge(item.status)}
                  <span className="text-technical-400">{item.brandName}</span>
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-xs text-technical-500 transition hover:text-danger"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-technical-500">
        Run <code className="rounded bg-technical-700 px-1">npm run mine -- --queue</code> to process pending brands.
      </p>
    </div>
  );
}

function UserRequestsPanel({
  initialRequests,
}: {
  initialRequests: UserRequestEntry[];
}) {
  const [requests, setRequests] =
    useState<UserRequestEntry[]>(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/requests");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests);
      }
    } catch {}
  }

  async function handleAction(id: string, action: "approve" | "reject" | "plan") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) await refresh();
    } catch {}
    setBusy(null);
  }

  async function handleDelete(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/requests?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {}
    setBusy(null);
  }

  const pending = requests.filter(
    (r) => r.status === "pending" || r.status === "planned"
  );
  const handled = requests.filter(
    (r) => r.status === "approved" || r.status === "rejected"
  );

  const reqBadge = (status: string) => {
    const s: Record<string, string> = {
      pending: "bg-warning/20 text-warning",
      approved: "bg-success/20 text-success",
      rejected: "bg-danger/20 text-danger",
      planned: "bg-accent/20 text-accent",
    };
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${s[status] ?? "bg-technical-600 text-technical-300"}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">User Requests</h2>
        <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-medium text-warning">
          {pending.length} pending
        </span>
      </div>

      {pending.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-technical-700 text-technical-400">
                <th className="pb-3 pr-4 font-medium">Brand</th>
                <th className="pb-3 pr-4 font-medium">Model</th>
                <th className="pb-3 pr-4 font-medium text-right">Votes</th>
                <th className="pb-3 pr-4 font-medium">When</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-technical-700/50">
              {pending.map((r) => (
                <tr key={r.id} className="text-technical-300">
                  <td className="py-3 pr-4 font-medium text-technical-200">
                    <div className="flex items-center gap-2">
                      {r.brand}
                      {r.status === "planned" && (
                        <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          listed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-technical-400">
                    {r.model || "—"}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent tabular-nums">
                      {r.voteCount}
                    </span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-technical-500">
                    {timeAgo(r.createdAt)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleAction(r.id, "approve")}
                        disabled={busy === r.id}
                        className="rounded px-2.5 py-1 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-50"
                      >
                        Approve & Mine
                      </button>
                      {r.status === "planned" ? (
                        <span className="rounded bg-accent/10 px-2.5 py-1 text-xs text-accent/60">
                          On site
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAction(r.id, "plan")}
                          disabled={busy === r.id}
                          className="rounded px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
                        >
                          Coming Soon
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(r.id, "reject")}
                        disabled={busy === r.id}
                        className="rounded px-2.5 py-1 text-xs text-danger transition hover:bg-danger/20 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-technical-500">No pending requests.</p>
      )}

      {handled.length > 0 && (
        <div className="mt-4 border-t border-technical-700 pt-3">
          <p className="mb-2 text-xs font-medium text-technical-400">
            History
          </p>
          <div className="space-y-1.5">
            {handled.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  {reqBadge(r.status)}
                  <span className="text-technical-400">
                    {r.brand}
                    {r.model ? ` / ${r.model}` : ""}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-xs text-technical-500 transition hover:text-danger"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageSettingsPanel() {
  const ALL_LANGS = [
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "no", label: "Norwegian", flag: "🇳🇴" },
    { code: "de", label: "German", flag: "🇩🇪" },
    { code: "es", label: "Spanish", flag: "🇪🇸" },
  ] as const;

  const [active, setActive] = useState<string[]>(["en"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setActive(d.activeLanguages ?? ["en"]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(code: string) {
    if (code === "en") return;
    const next = active.includes(code)
      ? active.filter((c) => c !== code)
      : [...active, code];

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeLanguages: next }),
      });
      if (res.ok) {
        const data = await res.json();
        setActive(data.activeLanguages);
      }
    } catch {}
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
      <h2 className="mb-1 text-lg font-semibold text-white">Active Languages</h2>
      <p className="mb-4 text-sm text-technical-500">
        Toggle which languages are visible on the public site. English is always active.
      </p>

      {loading ? (
        <p className="text-sm text-technical-400 animate-pulse">Loading...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ALL_LANGS.map((lang) => {
            const isActive = active.includes(lang.code);
            const isEnglish = lang.code === "en";
            return (
              <button
                key={lang.code}
                onClick={() => handleToggle(lang.code)}
                disabled={saving || isEnglish}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-accent bg-accent/10"
                    : "border-technical-700 bg-technical-900 opacity-60"
                } ${isEnglish ? "cursor-default" : "hover:border-accent/50"} disabled:pointer-events-none`}
              >
                <span className="text-xl">{lang.flag}</span>
                <div>
                  <p className={`text-sm font-medium ${isActive ? "text-white" : "text-technical-400"}`}>
                    {lang.label}
                  </p>
                  <p className="text-xs text-technical-500">
                    {isEnglish ? "Always active" : isActive ? "Active" : "Disabled"}
                  </p>
                </div>
                <div className="ml-auto">
                  <div
                    className={`h-5 w-9 rounded-full transition ${isActive ? "bg-accent" : "bg-technical-700"} relative`}
                  >
                    <div
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        isActive ? "left-[1.125rem]" : "left-0.5"
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TransBrand = {
  name: string;
  slug: string;
  total: number;
  translations: Record<string, number>;
};

type TransTotals = { total: number; no: number; de: number; es: number };

function TranslationPanel() {
  const [brands, setBrands] = useState<TransBrand[]>([]);
  const [totals, setTotals] = useState<TransTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    translated: number;
    failed: number;
    remaining: number;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/translations");
      if (res.ok) {
        const data = await res.json();
        setBrands(data.brands);
        setTotals(data.totals);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handlePreTranslate(brandSlug: string, brandName: string, lang: string) {
    const key = `${brandSlug}-${lang}`;
    setTranslating(key);
    setResult(null);
    setCancelled(false);
    let totalTranslated = 0;
    let totalFailed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await fetch("/api/admin/translations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandSlug, lang }),
        });

        if (!res.ok) {
          setResult(`${brandName} [${lang.toUpperCase()}]: Request failed`);
          break;
        }

        const data = await res.json();
        totalTranslated += data.translated ?? 0;
        totalFailed += data.failed ?? 0;

        setProgress({
          translated: totalTranslated,
          failed: totalFailed,
          remaining: data.remaining ?? 0,
        });

        fetchStats();

        if (data.done || data.remaining === 0) {
          setResult(
            `${brandName} [${lang.toUpperCase()}]: ${totalTranslated} translated, ${totalFailed} failed`
          );
          break;
        }

        if (cancelled) {
          setResult(
            `${brandName} [${lang.toUpperCase()}]: Stopped — ${totalTranslated} translated, ${totalFailed} failed, ${data.remaining} remaining`
          );
          break;
        }
      } catch {
        setResult(
          `${brandName} [${lang.toUpperCase()}]: Network error after ${totalTranslated} translated`
        );
        break;
      }
    }

    setTranslating(null);
    setProgress(null);
  }

  function handleCancel() {
    setCancelled(true);
  }

  const LANGS = ["no", "de", "es"] as const;
  const LANG_LABELS: Record<string, string> = { no: "NO", de: "DE", es: "ES" };
  const LANG_COLORS: Record<string, string> = {
    no: "bg-blue-500",
    de: "bg-amber-500",
    es: "bg-emerald-500",
  };

  function pct(n: number, total: number) {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }

  return (
    <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Translation Management
      </h2>

      {loading ? (
        <p className="text-sm text-technical-400 animate-pulse">
          Loading translation stats...
        </p>
      ) : !totals || totals.total === 0 ? (
        <p className="text-sm text-technical-500">
          No fault codes to translate yet.
        </p>
      ) : (
        <>
          {/* Global stats */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {LANGS.map((lang) => {
              const done = totals[lang];
              const p = pct(done, totals.total);
              return (
                <div
                  key={lang}
                  className="rounded-lg border border-technical-700 bg-technical-900 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-technical-300">
                      {LANG_LABELS[lang]}
                    </span>
                    <span className="text-xs tabular-nums text-technical-500">
                      {done}/{totals.total}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-technical-700">
                    <div
                      className={`h-full rounded-full transition-all ${LANG_COLORS[lang]}`}
                      style={{ width: `${Math.max(p, 1)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs font-semibold tabular-nums text-technical-400">
                    {p}%
                  </p>
                </div>
              );
            })}
          </div>

          {progress && translating && (
            <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
              <div className="flex items-center justify-between text-sm text-accent">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>
                    Translating... {progress.translated} done, {progress.failed} failed, {progress.remaining} remaining
                  </span>
                </div>
                <button
                  onClick={handleCancel}
                  className="rounded bg-technical-700 px-2 py-1 text-xs text-technical-300 hover:bg-technical-600 hover:text-white"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {result && !translating && (
            <div className="mb-4 rounded-lg bg-accent/10 px-4 py-2.5 text-sm text-accent">
              {result}
            </div>
          )}

          {/* Per-brand table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-technical-700 text-technical-400">
                  <th className="pb-3 pr-4 font-medium">Brand</th>
                  <th className="pb-3 pr-4 font-medium text-right">Codes</th>
                  {LANGS.map((lang) => (
                    <th
                      key={lang}
                      className="pb-3 pr-2 font-medium text-center"
                    >
                      {LANG_LABELS[lang]}
                    </th>
                  ))}
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-technical-700/50">
                {brands.map((b) => (
                  <tr key={b.slug} className="text-technical-300">
                    <td className="py-3 pr-4 font-medium text-technical-200">
                      {b.name}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-technical-500">
                      {b.total}
                    </td>
                    {LANGS.map((lang) => {
                      const done = b.translations[lang] ?? 0;
                      const p = pct(done, b.total);
                      const full = p === 100;
                      return (
                        <td key={lang} className="py-3 pr-2 text-center">
                          <div className="mx-auto w-16">
                            <div className="h-1.5 overflow-hidden rounded-full bg-technical-700">
                              <div
                                className={`h-full rounded-full ${full ? "bg-success" : LANG_COLORS[lang]}`}
                                style={{ width: `${Math.max(p, 2)}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-technical-500">
                              {p}%
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-3 text-right">
                      <select
                        disabled={translating !== null}
                        onChange={(e) => {
                          if (e.target.value) {
                            handlePreTranslate(b.slug, b.name, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="rounded border border-technical-600 bg-technical-900 px-2 py-1 text-xs text-technical-300 outline-none disabled:opacity-50"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {translating?.startsWith(b.slug)
                            ? "Translating..."
                            : "Translate"}
                        </option>
                        {LANGS.map((lang) => (
                          <option key={lang} value={lang}>
                            → {LANG_LABELS[lang]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function AdminDashboard({
  stats,
  brandStats,
  recentActivity,
  miningLogs,
  queue,
  userRequests,
}: Props) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          router.refresh();
          setLastRefresh(Date.now());
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [router]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  function handleManualRefresh() {
    router.refresh();
    setLastRefresh(Date.now());
    setCountdown(30);
  }

  const totalBrandCodes = brandStats.reduce((s, b) => s + b.faultCodes, 0);

  return (
    <div className="min-h-screen bg-technical-900 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-technical-400">
            ErrorLib mining overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 rounded-lg border border-technical-700 px-3 py-2 text-xs tabular-nums text-technical-400 transition hover:border-technical-500 hover:text-technical-200"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {countdown}s
          </button>
          <a
            href="/admin/edit-codes"
            className="rounded-lg border border-accent/50 px-4 py-2 text-sm text-accent transition hover:border-accent hover:bg-accent/10"
          >
            Edit Codes
          </a>
          <a
            href="/"
            className="rounded-lg border border-technical-600 px-4 py-2 text-sm text-technical-300 transition hover:border-technical-400 hover:text-white"
          >
            View Site
          </a>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-technical-700 px-4 py-2 text-sm text-technical-300 transition hover:bg-technical-600 hover:text-white"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Fault Codes"
          value={stats.faultCount}
          accent="text-accent"
        />
        <StatCard
          label="Brands"
          value={stats.brandCount}
          accent="text-success"
        />
        <StatCard
          label="Manuals Processed"
          value={stats.manualCount}
          accent="text-warning"
        />
      </div>

      {/* Mining Queue + User Requests — side by side */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        <MiningQueuePanel initialQueue={queue} />
        <UserRequestsPanel initialRequests={userRequests} />
      </div>

      {/* Mining Log — full width */}
      <div className="mb-8">
        <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Mining Log
          </h2>
          {miningLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-technical-700 text-technical-400">
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Brand</th>
                    <th className="pb-3 pr-4 font-medium">Manual</th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      Codes
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      Pages
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      Duration
                    </th>
                    <th className="pb-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-technical-700/50">
                  {miningLogs.map((entry) => (
                    <tr key={entry.id} className="text-technical-300">
                      <td className="py-3 pr-4">
                        {statusBadge(entry.status)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-medium text-technical-200">
                        {entry.brand}
                      </td>
                      <td className="py-3 pr-4 max-w-[220px] truncate text-technical-400">
                        {entry.manual}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        <span
                          className={
                            entry.codesFound > 0
                              ? "text-accent font-semibold"
                              : "text-technical-500"
                          }
                        >
                          {entry.codesFound}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-technical-500">
                        {entry.pagesUsed}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-technical-500">
                        {(entry.durationMs / 1000).toFixed(1)}s
                      </td>
                      <td className="py-3 whitespace-nowrap text-technical-500">
                        {timeAgo(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-technical-500">
              No mining runs recorded yet. Run the miner to see logs here.
            </p>
          )}
        </div>
      </div>

      {/* Language Settings + Translation Management */}
      <div className="mb-8 grid gap-8 lg:grid-cols-2">
        <LanguageSettingsPanel />
        <TranslationPanel />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Mining Status — left column */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Mining Status
            </h2>
            <div className="space-y-3">
              {brandStats.map((b) => {
                const pct =
                  totalBrandCodes > 0
                    ? Math.round((b.faultCodes / totalBrandCodes) * 100)
                    : 0;
                return (
                  <div key={b.slug}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-technical-200">
                        {b.name}
                      </span>
                      <span className="tabular-nums text-technical-400">
                        {b.faultCodes} codes
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-technical-700">
                      <div
                        className={`h-full rounded-full transition-all ${
                          b.faultCodes > 0 ? "bg-accent" : "bg-technical-600"
                        }`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-technical-500">
                      {b.manuals} {b.manuals === 1 ? "manual" : "manuals"}
                    </p>
                  </div>
                );
              })}

              {brandStats.length === 0 && (
                <p className="text-sm text-technical-500">
                  No brands mined yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity — right column */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-technical-700 bg-technical-800 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Recent Fault Codes
            </h2>
            {recentActivity.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-technical-700 text-technical-400">
                      <th className="pb-3 pr-4 font-medium">Code</th>
                      <th className="pb-3 pr-4 font-medium">Title</th>
                      <th className="pb-3 pr-4 font-medium">Brand</th>
                      <th className="pb-3 pr-4 font-medium">Manual</th>
                      <th className="pb-3 font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-technical-700/50">
                    {recentActivity.map((entry) => (
                      <tr key={entry.id} className="text-technical-300">
                        <td className="py-3 pr-4">
                          <span className="rounded bg-technical-700 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                            {entry.code}
                          </span>
                        </td>
                        <td className="py-3 pr-4 max-w-[200px] truncate">
                          {entry.title}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-technical-400">
                          {entry.brandName}
                        </td>
                        <td className="py-3 pr-4 max-w-[180px] truncate text-technical-500">
                          {entry.manualName}
                        </td>
                        <td className="py-3 whitespace-nowrap text-technical-500">
                          {timeAgo(entry.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-technical-500">
                No fault codes extracted yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
