import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SeriesFaultList } from "@/components/SeriesFaultList";
import type { SeriesFaultItem } from "@/components/SeriesFaultList";
import { RequestForm } from "@/app/request-form";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { mergeSimilarSeriesGroups } from "@/lib/mergeSimilarSeries";

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

// ── Types ──

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
  // ABB
  [/\b(ACS\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(AC500)/i, () => "AC500"],
  [/\b(AX\d{4})/i, (m) => m[1].toUpperCase()],
  // Allen-Bradley / Rockwell
  [/\b(PowerFlex)\s*(\d+)/i, (m) => `PowerFlex ${m[2]}`],
  // Danfoss
  [/\b(VLT)\s+([\w-]+)/i, (m) => `VLT ${m[2]}`],
  [/\b(FC\s*\d{2,3})/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  // Siemens
  [/\b(SINAMICS)\s+(\w+)/i, (m) => `SINAMICS ${m[2]}`],
  [/\b(SINUMERIK)\s+(\w+)/i, (m) => `SINUMERIK ${m[2]}`],
  // SEW
  [/\b(MOVIDRIVE)\b/i, () => "MOVIDRIVE"],
  [/\b(MOVIFIT)\b/i, () => "MOVIFIT"],
  [/\b(MCBSM)\b/i, () => "MCBSM"],
  // Schneider
  [/\b(Altivar|ALTIVAR|ATV)\s*(\d+)/i, (m) => `Altivar ${m[2]}`],
  [/\b(Altistart)\s*(\d+)/i, (m) => `Altistart ${m[2]}`],
  [/\b(XW\s*Pro)\b/i, () => "XW Pro"],
  // Beckhoff
  [/\b(TwinCAT)\s*(\d*)/i, (m) => m[2] ? `TwinCAT ${m[2]}` : "TwinCAT"],
  [/\b(TwinSAFE)\b/i, () => "TwinSAFE"],
  // Mitsubishi
  [/\b(FR[-\s]?[A-Z]\d{3})/i, (m) => m[1].replace(/\s+/g, "").replace(/-/g, "-").toUpperCase()],
  // Vacon
  [/\b(NXS|NXP)\b/i, () => "NXS/NXP"],
  // Omron
  [/\b(MX2)\b/i, () => "MX2"],
  [/\b(SXF)\b/i, () => "SXF"],
  [/\b(3G3EV)\b/i, () => "3G3EV"],
  // Daikin / HVAC
  [/\b(BP\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(MSZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(PUZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  // Fanuc — must be before generic fallback
  [/\b(R-30i[AB]\w*)/i, (m) => m[1].toUpperCase()],
  [/\bSeries\s+(0i[-\s]?\w*)/i, (m) => `Series ${m[1].replace(/\s+/g, "")}`],
  [/\bSeries\s+(3[012]i\S*)/i, (m) => `Series ${m[1]}`],
  [/\bSeries\s+(\d+i\S*)/i, (m) => `Series ${m[1]}`],
  [/[αa]i[\s-]*(?:series|Series)\b/i, () => "αi Series"],
  [/\b(?:series|Series)[\s-]*[αa]i\b/i, () => "αi Series"],
  [/\bMacro\s*B\b/i, () => "Macro B"],
  [/\bKRC\s*(\d+)/i, (m) => `KRC${m[1]}`],
  [/\bKR\s*C(\d+)/i, (m) => `KRC${m[1]}`],
  // Generic model number fallback (must be last)
  [/\b([A-Z]\d{3,4})\b/i, (m) => m[1].toUpperCase()],
];

const GENERIC_NAMES = new Set([
  "system", "general", "other", "misc", "unknown",
  "diagnostics", "alarms", "faults", "list",
  "connection", "manual", "manual guide", "guide",
  "maintenance", "parameter", "parameters", "information",
  "service", "bulletin", "installation", "reference",
  "description", "operator", "document",
]);

const PART_NUMBER_RE = /^[A-Z]\d{2}[A-Z]-\d|^\d{1,2}[A-Z]{2}\d{4}|^\d{6,}|^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,4}/i;

function extractSeries(manualName: string, brandName: string): string {
  const stripped = manualName
    .replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(/^\[PDF\]\s*/i, "")
    .trim();

  for (const [pattern, extract] of SERIES_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) return extract(match);
  }

  const words = stripped.split(/\s+/);
  const lead = words
    .slice(0, 3)
    .filter((w) => /^[A-Z0-9]/.test(w) && w.length >= 2 && !PART_NUMBER_RE.test(w));
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

  return real.sort((a, b) => a.series.localeCompare(b.series, undefined, { numeric: true }));
}

// ── Manual priority for deduplication (higher = preferred) ──

const TAG_PRIORITY: Record<string, number> = {
  firmware: 10,
  "standard control program": 9,
  primary: 8,
  "control program": 7,
  software: 6,
  hardware: 5,
  safety: 4,
  general: 3,
};

function tagPriority(label: string): number {
  const lower = label.toLowerCase();
  for (const [key, val] of Object.entries(TAG_PRIORITY)) {
    if (lower.includes(key)) return val;
  }
  return 1;
}

// ── Arrow icon ──

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Localization helper ──

type TranslationEntry = { title?: string; description?: string };
type TranslationsMap = Record<string, TranslationEntry>;

function localized(
  fc: { title: string; description: string; translations: unknown },
  locale: Locale
) {
  if (locale === "en") return { title: fc.title, description: fc.description };
  const map = (fc.translations as TranslationsMap) ?? {};
  const tr = map[locale];
  return {
    title: tr?.title || fc.title,
    description: tr?.description || fc.description,
  };
}

// ── Page ──

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

  const groups = mergeSimilarSeriesGroups(
    groupManuals(brand.manuals, brand.name),
    0.8
  );
  const totalCodes = groups.reduce((s, g) => s + g.totalCodes, 0);

  // ── Series Fault-Code List ──
  if (seriesFilter) {
    const group = groups.find(
      (g) => g.series.toLowerCase() === seriesFilter.toLowerCase()
    );
    if (!group) notFound();

    const manualIds = group.manuals.map((m) => m.manual.id);
    const labelById = new Map(
      group.manuals.map((m) => [m.manual.id, m.label])
    );
    const priorityById = new Map(
      group.manuals.map((m) => [m.manual.id, tagPriority(m.label)])
    );
    const slugById = new Map(
      group.manuals.map((m) => [m.manual.id, m.manual.slug])
    );

    const rawCodes = await prisma.faultCode.findMany({
      where: { manualId: { in: manualIds } },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        slug: true,
        translations: true,
        manualId: true,
      },
    });

    // Deduplicate: keep highest-priority manual per fault code
    const deduped = new Map<
      string,
      (typeof rawCodes)[number] & { priority: number }
    >();

    for (const fc of rawCodes) {
      const key = fc.code.toLowerCase();
      const priority = priorityById.get(fc.manualId) ?? 0;
      const existing = deduped.get(key);
      if (!existing || priority > existing.priority) {
        deduped.set(key, { ...fc, priority });
      }
    }

    const codes = Array.from(deduped.values()).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true })
    );

    // Build filter tags (only include tags that survived dedup)
    const usedTags = new Set(codes.map((fc) => labelById.get(fc.manualId) ?? "General"));
    const tags = group.manuals
      .map((m) => m.label)
      .filter((label, i, arr) => arr.indexOf(label) === i && usedTags.has(label))
      .sort((a, b) => (tagPriority(b) - tagPriority(a)));

    const items: SeriesFaultItem[] = codes.map((fc) => {
      const loc = localized(fc, locale);
      const manualSlug = slugById.get(fc.manualId) ?? "";
      return {
        id: fc.id,
        code: fc.code,
        title: loc.title,
        description: loc.description,
        href: `/${brand.slug}/${manualSlug}/${fc.slug}`,
        tag: labelById.get(fc.manualId) ?? "General",
      };
    });

    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs
          items={[
            { label: t("home", locale), href: "/" },
            { label: brand.name, href: `/${brand.slug}` },
            { label: group.series },
          ]}
        />

        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-technical-50 sm:text-3xl">
            {brand.name} {group.series}
          </h1>
          <p className="mt-1 text-sm text-technical-300">
            {codes.length}{" "}
            {codes.length === 1 ? t("faultCode", locale) : t("faultCodes", locale)}{" "}
            {t("documented", locale)}
          </p>
        </div>

        <SeriesFaultList
          items={items}
          tags={tags}
          allLabel={t("filterAll", locale)}
        />
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
            const href = `/${brand.slug}?series=${encodeURIComponent(group.series)}`;

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

      <RequestForm locale={locale} defaultBrand={brand.name} variant="brand" />
    </div>
  );
}
