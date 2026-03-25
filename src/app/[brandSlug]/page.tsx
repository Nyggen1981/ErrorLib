import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ series?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) return {};
  const title = `Complete List of ${brand.name} Fault Codes & Manuals | ErrorLib`;
  const description = `Browse all ${brand.name} fault codes, error descriptions, and step-by-step troubleshooting guides for industrial drives, PLCs, and controllers.`;
  return {
    title,
    description,
    alternates: { canonical: `/${brand.slug}` },
    openGraph: { title, description, type: "website", url: `/${brand.slug}` },
  };
}

type ManualWithCount = {
  id: string;
  name: string;
  slug: string;
  _count: { faultCodes: number };
};

type SeriesGroup = {
  series: string;
  manuals: { manual: ManualWithCount; label: string }[];
  totalCodes: number;
};

// ── Smart Grouping Engine ──

const SERIES_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/\b(ACS\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(AC500)/i, () => "AC500"],
  [/\b(AX\d{4})/i, (m) => m[1].toUpperCase()],
  [/\b(PowerFlex)\s*(\d+)/i, (m) => `PowerFlex ${m[2]}`],
  [/\b(VLT)\s+([\w-]+)/i, (m) => `VLT ${m[2]}`],
  [/\b(FC\s*\d{2,3})/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(SINAMICS)\s+(\w+)/i, (m) => `SINAMICS ${m[2]}`],
  [/\b(SINUMERIK)\s+(\w+)/i, (m) => `SINUMERIK ${m[2]}`],
  [/\b(MOVIDRIVE)\b/i, () => "MOVIDRIVE"],
  [/\b(MOVIFIT)\b/i, () => "MOVIFIT"],
  [/\b(MCBSM)\b/i, () => "MCBSM"],
  [/\b(Altivar|ALTIVAR|ATV)\s*(\d+)/i, (m) => `Altivar ${m[2]}`],
  [/\b(Altistart)\s*(\d+)/i, (m) => `Altistart ${m[2]}`],
  [/\b(XW\s*Pro)\b/i, () => "XW Pro"],
  [/\b(TwinCAT)\s*(\d*)/i, (m) => m[2] ? `TwinCAT ${m[2]}` : "TwinCAT"],
  [/\b(TwinSAFE)\b/i, () => "TwinSAFE"],
  [/\b(FR[-\s]?[A-Z]\d{3})/i, (m) => m[1].replace(/\s+/g, "").replace(/-/g, "-").toUpperCase()],
  [/\b(NXS|NXP)\b/i, () => "NXS/NXP"],
  [/\b(MX2)\b/i, () => "MX2"],
  [/\b(SXF)\b/i, () => "SXF"],
  [/\b(3G3EV)\b/i, () => "3G3EV"],
  [/\b(BP\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(MSZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(PUZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b([A-Z]\d{3,4})\b/i, (m) => m[1].toUpperCase()],
];

const GENERIC_NAMES = new Set([
  "system", "general", "other", "misc", "unknown",
  "diagnostics", "alarms", "faults", "list",
]);

function extractSeries(manualName: string, brandName: string): string {
  const stripped = manualName
    .replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .trim();

  for (const [pattern, extract] of SERIES_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) return extract(match);
  }

  const words = stripped.split(/\s+/);
  const lead = words
    .slice(0, 2)
    .filter((w) => /^[A-Z0-9]/.test(w) && w.length >= 2);
  return lead.length > 0 ? lead.join(" ") : words.slice(0, 2).join(" ");
}

function manualLabel(manualName: string, brandName: string, series: string): string {
  let label = manualName
    .replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(new RegExp(series.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
    .replace(/^[\s,\-–—:]+/, "")
    .replace(/[\s,\-–—:]+$/, "")
    .replace(/\b(variable\s+speed|frequency|adjustable\s+frequency)\s+(ac\s+)?drive\b/gi, "")
    .replace(/\b(ac\s+)?drive\b/gi, "")
    .replace(/\b(list|manual|guide|handbook|reference|instruction)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!label || label.length < 2) label = "General";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupManuals(manuals: ManualWithCount[], brandName: string): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();

  for (const manual of manuals) {
    if (manual._count.faultCodes === 0) continue;

    const series = extractSeries(manual.name, brandName);
    const label = manualLabel(manual.name, brandName, series);

    const existing = groups.get(series);
    if (existing) {
      existing.manuals.push({ manual, label });
      existing.totalCodes += manual._count.faultCodes;
    } else {
      groups.set(series, {
        series,
        manuals: [{ manual, label }],
        totalCodes: manual._count.faultCodes,
      });
    }
  }

  // Merge generic-named groups into the largest real group
  const generics: SeriesGroup[] = [];
  const real: SeriesGroup[] = [];

  for (const group of groups.values()) {
    if (GENERIC_NAMES.has(group.series.toLowerCase())) {
      generics.push(group);
    } else {
      real.push(group);
    }
  }

  if (generics.length > 0 && real.length > 0) {
    const largest = real.reduce((a, b) => (a.totalCodes >= b.totalCodes ? a : b));
    for (const g of generics) {
      largest.manuals.push(...g.manuals);
      largest.totalCodes += g.totalCodes;
    }
  } else if (generics.length > 0) {
    real.push(...generics);
  }

  return real.sort((a, b) => b.totalCodes - a.totalCodes);
}

// ── Arrow icon ──

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { brandSlug } = await params;
  const { series: seriesFilter } = await searchParams;
  const locale = await getLocale();

  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    include: {
      manuals: {
        include: { _count: { select: { faultCodes: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!brand) notFound();

  const groups = groupManuals(brand.manuals, brand.name);
  const totalCodes = groups.reduce((s, g) => s + g.totalCodes, 0);

  // ── Series Landing View ──
  if (seriesFilter) {
    const group = groups.find(
      (g) => g.series.toLowerCase() === seriesFilter.toLowerCase()
    );
    if (!group) notFound();

    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          items={[
            { label: t("home", locale), href: "/" },
            { label: brand.name, href: `/${brand.slug}` },
            { label: group.series },
          ]}
        />

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-technical-50 sm:text-3xl">
            {brand.name} {group.series}
          </h1>
          <p className="mt-1 text-sm text-technical-300">
            {group.manuals.length}{" "}
            {group.manuals.length === 1 ? t("manual", locale) : t("manuals", locale)}
            {" \u00B7 "}
            {group.totalCodes} {t("faultCodes", locale)}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {group.manuals
            .sort((a, b) => b.manual._count.faultCodes - a.manual._count.faultCodes)
            .map(({ manual, label }) => (
              <a
                key={manual.id}
                href={`/${brand.slug}/${manual.slug}`}
                className="group flex items-center justify-between rounded-lg border border-technical-700 bg-technical-800 p-5 transition-all hover:border-technical-500 hover:bg-technical-700"
              >
                <div className="min-w-0">
                  <h2 className="font-semibold text-technical-50 transition-colors group-hover:text-accent">
                    {label}
                  </h2>
                  <p className="mt-0.5 text-xs text-technical-400">
                    {manual._count.faultCodes} {t("faultCodes", locale)}
                  </p>
                </div>
                <div className="ml-3 shrink-0 text-accent opacity-0 transition group-hover:opacity-100">
                  <ArrowIcon />
                </div>
              </a>
            ))}
        </div>
      </div>
    );
  }

  // ── Main Grid View ──
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Breadcrumbs
        items={[{ label: t("home", locale), href: "/" }, { label: brand.name }]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-technical-50 sm:text-3xl">
          {brand.name}
        </h1>
        <p className="mt-1 text-sm text-technical-300">
          {groups.length > 0
            ? `${groups.length} ${groups.length === 1 ? t("modelFamily", locale) : t("modelFamilies", locale)} \u00B7 ${totalCodes} ${t("faultCodes", locale)}`
            : t("noFaultCodesYet", locale)}
        </p>
      </div>

      {groups.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const hasSingle = group.manuals.length === 1;
            const primary = group.manuals.reduce((best, m) =>
              m.manual._count.faultCodes > best.manual._count.faultCodes ? m : best
            );
            const href = hasSingle
              ? `/${brand.slug}/${primary.manual.slug}`
              : `/${brand.slug}?series=${encodeURIComponent(group.series)}`;

            return (
              <a
                key={group.series}
                href={href}
                className="group flex items-center justify-between rounded-lg border border-technical-700 bg-technical-800 p-5 transition-all hover:border-technical-500 hover:bg-technical-700"
              >
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-technical-50 transition-colors group-hover:text-accent">
                    {group.series}
                  </h2>
                  <p className="mt-0.5 text-xs text-technical-400">
                    {group.manuals.length}{" "}
                    {group.manuals.length === 1
                      ? t("manual", locale)
                      : t("manuals", locale)}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-3">
                  <span className="rounded bg-accent/15 px-2.5 py-1 text-sm font-bold tabular-nums text-accent">
                    {group.totalCodes}
                  </span>
                  <span className="text-accent opacity-0 transition group-hover:opacity-100">
                    <ArrowIcon />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-technical-600 p-10 text-center">
          <p className="text-technical-300">
            {t("noFaultCodesExtracted", locale)} {brand.name}.
          </p>
          <p className="mt-1 text-xs text-technical-400">
            {t("docBeingIndexed", locale)}
          </p>
        </div>
      )}
    </div>
  );
}
