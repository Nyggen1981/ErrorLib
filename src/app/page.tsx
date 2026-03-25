import { prisma } from "@/lib/prisma";
import { RequestForm } from "./request-form";

export const dynamic = "force-dynamic";

const BRAND_COLORS: Record<string, string> = {
  abb: "border-t-red-500",
  siemens: "border-t-sky-500",
  "schneider electric": "border-t-emerald-500",
  yaskawa: "border-t-cyan-500",
  danfoss: "border-t-blue-800",
  lenze: "border-t-orange-500",
  "mitsubishi electric": "border-t-red-600",
  "rockwell / allen-bradley": "border-t-amber-500",
};

export default async function HomePage() {
  const [brands, plannedRequests] = await Promise.all([
    prisma.brand.findMany({
      include: {
        manuals: {
          include: { _count: { select: { faultCodes: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.userRequest.findMany({
      where: { status: "planned" },
      orderBy: { voteCount: "desc" },
    }),
  ]);

  const brandsWithStats = brands.map((b) => ({
    ...b,
    totalFaultCodes: b.manuals.reduce(
      (sum, m) => sum + m._count.faultCodes,
      0
    ),
    populatedManuals: b.manuals.filter((m) => m._count.faultCodes > 0).length,
  }));

  const activeBrands = brandsWithStats.filter((b) => b.totalFaultCodes > 0);
  const activeNames = new Set(activeBrands.map((b) => b.name.toLowerCase()));

  const comingSoon = plannedRequests.filter(
    (r) => !activeNames.has(r.brand.toLowerCase())
  );

  const totalCodes = activeBrands.reduce((s, b) => s + b.totalFaultCodes, 0);

  return (
    <>
      {/* Hero */}
      <section className="hero-grid bg-technical-900 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Industrial Fault Code Library
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-technical-400">
            Find troubleshooting guides for industrial drives, PLCs, and
            controllers. Select a brand to get started.
          </p>
          {totalCodes > 0 && (
            <div className="mt-6 flex items-center justify-center gap-6 text-sm">
              <span className="rounded-full bg-white/10 px-4 py-1.5 font-medium tabular-nums text-white">
                {totalCodes.toLocaleString()} fault codes
              </span>
              <span className="rounded-full bg-white/10 px-4 py-1.5 font-medium tabular-nums text-white">
                {activeBrands.length} brands
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Brand Cards */}
        {activeBrands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-technical-300 bg-white p-12 text-center">
            <p className="text-technical-400">
              No brands indexed yet. Documentation is currently being reviewed.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeBrands.map((brand) => {
              const colorClass =
                BRAND_COLORS[brand.name.toLowerCase()] ?? "border-t-technical-400";

              return (
                <a
                  key={brand.id}
                  href={`/${brand.slug}`}
                  className={`group rounded-xl border border-technical-200 border-t-2 ${colorClass} bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <h2 className="text-xl font-bold tracking-tight text-technical-900 group-hover:text-accent transition-colors">
                    {brand.name}
                  </h2>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full bg-technical-100 px-2.5 py-0.5 text-xs font-medium text-technical-600">
                      {brand.populatedManuals}{" "}
                      {brand.populatedManuals === 1 ? "manual" : "manuals"}
                    </span>
                    <span className="rounded-full bg-technical-100 px-2.5 py-0.5 text-xs font-medium text-technical-700">
                      {brand.totalFaultCodes} codes
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* Under Documentation — driven by "planned" user requests */}
        {comingSoon.length > 0 && (
          <section className="mt-14">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-technical-700">
                Under Documentation
              </h2>
              <p className="mt-1 text-sm text-technical-400">
                Our technicians are currently indexing documentation for the
                following manufacturers / models.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {comingSoon.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-technical-100 bg-white/60 px-5 py-4 transition-all duration-200 hover:border-technical-200 hover:shadow-sm"
                >
                  <p className="font-medium text-technical-600">
                    {req.brand}
                  </p>
                  {req.voteCount >= 20 && (
                    <p className="mt-1 text-xs text-technical-400">
                      {req.voteCount} requests
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      <RequestForm />
    </>
  );
}
