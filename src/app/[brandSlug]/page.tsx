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
import {
  groupManualsAsOnSite,
  type ManualWithCount,
  type SeriesGroup,
} from "@/lib/brand-series-grouping";

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
  if (!label.trim()) return 0;
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

  const groups = groupManualsAsOnSite(brand.manuals, brand.name);
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

    // Build filter tags (only include tags that survived dedup; omit empty / "General")
    const usedTags = new Set(
      codes.map((fc) => labelById.get(fc.manualId) ?? "")
    );
    const tags = group.manuals
      .map((m) => m.label)
      .filter(
        (label, i, arr) =>
          label.trim() !== "" &&
          arr.indexOf(label) === i &&
          usedTags.has(label)
      )
      .sort((a, b) => tagPriority(b) - tagPriority(a));

    const items: SeriesFaultItem[] = codes.map((fc) => {
      const loc = localized(fc, locale);
      const manualSlug = slugById.get(fc.manualId) ?? "";
      return {
        id: fc.id,
        code: fc.code,
        title: loc.title,
        description: loc.description,
        href: `/${brand.slug}/${manualSlug}/${fc.slug}`,
        tag: labelById.get(fc.manualId) ?? "",
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
