import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const COMING_SOON_BRANDS = [
  { name: "Danfoss", category: "Frequency Drives" },
  { name: "Schneider Electric", category: "Altivar Drives & PLCs" },
  { name: "Mitsubishi Electric", category: "FR Series Inverters" },
  { name: "Yaskawa", category: "AC Drives" },
  { name: "Rockwell / Allen-Bradley", category: "PowerFlex Drives" },
  { name: "Lenze", category: "Servo & Frequency Inverters" },
  { name: "Siemens", category: "SINAMICS & SIMATIC Drives" },
];

export default async function HomePage() {
  const brands = await prisma.brand.findMany({
    include: {
      manuals: {
        include: { _count: { select: { faultCodes: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const brandsWithStats = brands.map((b) => ({
    ...b,
    totalFaultCodes: b.manuals.reduce(
      (sum, m) => sum + m._count.faultCodes,
      0
    ),
    populatedManuals: b.manuals.filter((m) => m._count.faultCodes > 0).length,
  }));

  const activeBrands = brandsWithStats.filter((b) => b.totalFaultCodes > 0);

  const emptyDbNames = new Set(
    brandsWithStats
      .filter((b) => b.totalFaultCodes === 0)
      .map((b) => b.name.toLowerCase())
  );
  const activeNames = new Set(activeBrands.map((b) => b.name.toLowerCase()));

  const comingSoon = COMING_SOON_BRANDS.filter(
    (b) => !activeNames.has(b.name.toLowerCase())
  );

  for (const b of brandsWithStats) {
    if (
      b.totalFaultCodes === 0 &&
      !comingSoon.some((c) => c.name.toLowerCase() === b.name.toLowerCase())
    ) {
      comingSoon.push({ name: b.name, category: "Industrial Equipment" });
    }
  }

  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Industrial Fault Code Library
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-technical-500">
          Find troubleshooting guides for industrial drives, PLCs, and
          controllers. Select a brand to get started.
        </p>
      </div>

      {activeBrands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-technical-300 bg-white p-12 text-center">
          <p className="text-technical-400">
            No brands yet. Run the mining rig to populate the database.
          </p>
          <code className="mt-2 inline-block rounded bg-technical-100 px-3 py-1.5 font-mono text-sm text-technical-600">
            npm run mine -- --brand=&quot;ABB&quot;
          </code>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeBrands.map((brand) => (
            <a
              key={brand.id}
              href={`/${brand.slug}`}
              className="group rounded-xl border border-technical-200 bg-white p-6 transition-all hover:border-technical-300 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold group-hover:text-accent transition-colors">
                {brand.name}
              </h2>
              <div className="mt-2 flex items-center gap-3 text-sm text-technical-400">
                <span>
                  {brand.populatedManuals}{" "}
                  {brand.populatedManuals === 1 ? "manual" : "manuals"}
                </span>
                <span className="h-1 w-1 rounded-full bg-technical-300" />
                <span className="font-medium text-technical-600">
                  {brand.totalFaultCodes} fault codes
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {comingSoon.length > 0 && (
        <section className="mt-16">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-technical-700">
              Coming Soon
            </h2>
            <p className="mt-1 text-sm text-technical-400">
              These brands are next in the mining queue.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((brand) => (
              <div
                key={brand.name}
                className="flex items-center gap-4 rounded-xl border border-technical-100 bg-white/50 px-5 py-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-technical-100">
                  <span className="font-mono text-xs font-bold text-technical-400">
                    {brand.name
                      .split(/[\s/]+/)
                      .map((w) => w[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-technical-500">
                    {brand.name}
                  </p>
                  <p className="text-xs text-technical-300">
                    {brand.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
