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

  async function handleAction(id: string, action: "approve" | "reject") {
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

  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status !== "pending");

  const reqBadge = (status: string) => {
    const s: Record<string, string> = {
      pending: "bg-warning/20 text-warning",
      approved: "bg-success/20 text-success",
      rejected: "bg-danger/20 text-danger",
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
                    {r.brand}
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
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleAction(r.id, "approve")}
                        disabled={busy === r.id}
                        className="rounded px-2.5 py-1 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-50"
                      >
                        Approve & Mine
                      </button>
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
