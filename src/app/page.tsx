import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { SearchBar } from "@/components/SearchBar";
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

function normalizeBrandKey(name: string): string {
  const compact = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // Collapse known aliases/noise variants into one display bucket.
  if (compact.startsWith("mitsubishi electric")) return "mitsubishi electric";
  return compact;
}

export default async function HomePage() {
  const locale = await getLocale();

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

  const activeBrandsRaw = brandsWithStats.filter((b) => b.totalFaultCodes > 0);
  const grouped = new Map<string, (typeof activeBrandsRaw)[number]>();

  for (const brand of activeBrandsRaw) {
    const key = normalizeBrandKey(brand.name);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, brand);
      continue;
    }

    // Keep one card per normalized brand, aggregating metrics.
    grouped.set(key, {
      ...existing,
      totalFaultCodes: existing.totalFaultCodes + brand.totalFaultCodes,
      populatedManuals: existing.populatedManuals + brand.populatedManuals,
    });
  }

  const activeBrands = Array.from(grouped.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const activeNames = new Set(activeBrands.map((b) => normalizeBrandKey(b.name)));

  const comingSoon = plannedRequests.filter(
    (r) => !activeNames.has(normalizeBrandKey(r.brand))
  );

  const totalCodes = activeBrands.reduce((s, b) => s + b.totalFaultCodes, 0);

  return (
    <>
      {/* Hero */}
      <section className="hero-grid bg-technical-900 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-technical-50 sm:text-4xl">
            {t("heroTitle", locale)}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-technical-300">
            {t("heroSubtitle", locale)}
          </p>
          <div className="mx-auto mt-6 max-w-2xl">
            <SearchBar variant="hero" locale={locale} />
          </div>
          {totalCodes > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <span className="rounded-full border border-technical-600 px-3 py-1 font-medium tabular-nums text-technical-200">
                {totalCodes.toLocaleString()} {t("faultCodes", locale)}
              </span>
              <span className="rounded-full border border-technical-600 px-3 py-1 font-medium tabular-nums text-technical-200">
                {activeBrands.length} {t("brands", locale).toLowerCase()}
              </span>
              <span className="animate-pulse-subtle text-xs text-accent-dark">
                {t("andCounting", locale)}
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {activeBrands.length === 0 ? (
          <div className="rounded-lg border border-dashed border-technical-600 p-10 text-center">
            <p className="text-technical-300">
              {t("noBrandsYet", locale)}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeBrands.map((brand) => {
              const colorClass =
                BRAND_COLORS[normalizeBrandKey(brand.name)] ?? "border-t-technical-400";

              return (
                <a
                  key={brand.id}
                  href={`/${brand.slug}`}
                  className={`group rounded-lg border border-technical-700 border-t-2 ${colorClass} bg-technical-800 p-5 transition-all hover:border-technical-500 hover:bg-technical-700`}
                >
                  <h2 className="text-lg font-bold tracking-tight text-technical-50 transition-colors group-hover:text-accent">
                    {brand.name}
                  </h2>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded bg-technical-700 px-2 py-0.5 text-xs font-medium text-technical-200">
                      {brand.populatedManuals}{" "}
                      {brand.populatedManuals === 1
                        ? t("manual", locale)
                        : t("manuals", locale)}
                    </span>
                    <span className="rounded bg-technical-700 px-2 py-0.5 text-xs font-medium text-accent">
                      {brand.totalFaultCodes} {t("codes", locale)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {comingSoon.length > 0 && (
          <section className="mt-8">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-technical-200">
                {t("underDocumentation", locale)}
              </h2>
              <p className="mt-0.5 text-xs text-technical-400">
                {t("underDocSubtitle", locale)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {comingSoon.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-technical-700 bg-technical-800/50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-technical-200">
                    {req.brand}
                  </p>
                  {req.voteCount >= 20 && (
                    <p className="mt-0.5 text-xs text-technical-400">
                      {req.voteCount} {t("requests", locale)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <RequestForm locale={locale} />
    </>
  );
}
