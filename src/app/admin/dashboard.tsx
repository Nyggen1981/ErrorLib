"use client";

import { useRouter } from "next/navigation";

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
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-technical-600 text-technical-300"}`}
    >
      {status}
    </span>
  );
}

export function AdminDashboard({
  stats,
  brandStats,
  recentActivity,
  miningLogs,
}: Props) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const totalBrandCodes = brandStats.reduce((s, b) => s + b.faultCodes, 0);

  return (
    <div className="-mx-4 -mt-8 min-h-screen bg-technical-900 px-4 py-8 sm:-mx-6 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-technical-400">
            ErrorLib mining overview
          </p>
        </div>
        <div className="flex items-center gap-3">
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
