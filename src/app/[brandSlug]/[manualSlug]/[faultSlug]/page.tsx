import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TranslatedContent } from "@/components/TranslatedContent";
import {
  TranslatedTitle,
  TranslatedDescription,
  TranslatedPrioritySteps,
  TranslatedMoreSteps,
  TranslatedFullSteps,
  TranslatingBanner,
} from "@/components/FaultCodeContent";
import { AdSlot } from "@/components/AdSlot";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import type { Metadata } from "next";

type Props = {
  params: Promise<{
    brandSlug: string;
    manualSlug: string;
    faultSlug: string;
  }>;
};

function stripBrand(manualName: string, brandName: string): string {
  const re = new RegExp(`^${brandName}\\s+`, "i");
  return manualName.replace(re, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brandSlug, manualSlug, faultSlug } = await params;
  const fault = await prisma.faultCode.findUnique({
    where: { slug: faultSlug },
    include: { manual: { include: { brand: true } } },
  });
  if (
    !fault ||
    fault.manual.slug !== manualSlug ||
    fault.manual.brand.slug !== brandSlug
  )
    return {};

  const brand = fault.manual.brand.name;
  const display = stripBrand(fault.manual.name, brand);
  const title = `${brand} Error ${fault.code}: ${fault.title} — Troubleshooting Guide`;
  const description = `Find causes and solutions for ${brand} fault code ${fault.code}. Expert technical reference for industrial automation. ${fault.description.slice(0, 100)}`;
  const url = `/${fault.manual.brand.slug}/${fault.manual.slug}/${fault.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
    },
  };
}

export default async function FaultCodePage({ params }: Props) {
  const { brandSlug, manualSlug, faultSlug } = await params;
  const locale = await getLocale();

  const fault = await prisma.faultCode.findUnique({
    where: { slug: faultSlug },
    include: { manual: { include: { brand: true } } },
  });

  if (
    !fault ||
    fault.manual.slug !== manualSlug ||
    fault.manual.brand.slug !== brandSlug
  )
    notFound();

  const displayName = stripBrand(fault.manual.name, fault.manual.brand.name);

  const englishContent = {
    title: fault.title,
    description: fault.description,
    fixSteps: fault.fixSteps,
  };

  const translations = (fault.translations as Record<string, typeof englishContent>) ?? {};
  const cachedTranslation = locale !== "en" ? translations[locale] ?? null : null;

  const brandName = fault.manual.brand.name;
  const pageUrl = `https://errorlib.net/${fault.manual.brand.slug}/${fault.manual.slug}/${fault.slug}`;

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to fix ${brandName} ${fault.code}: ${fault.title}`,
    description: fault.description,
    step: fault.fixSteps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text: step,
    })),
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${brandName} Error ${fault.code}: ${fault.title}`,
    description: fault.description,
    url: pageUrl,
    publisher: {
      "@type": "Organization",
      name: "ErrorLib",
      url: "https://errorlib.net",
    },
    datePublished: fault.createdAt.toISOString(),
    dateModified: fault.updatedAt.toISOString(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <TranslatedContent
      faultCodeId={fault.id}
      locale={locale}
      fallback={englishContent}
      cached={cachedTranslation}
    >
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          {
            label: fault.manual.brand.name,
            href: `/${fault.manual.brand.slug}`,
          },
          {
            label: displayName,
            href: `/${fault.manual.brand.slug}/${fault.manual.slug}`,
          },
          { label: fault.code },
        ]}
      />

      <TranslatingBanner label={t("translating", locale)} />

      {/* Compressed Hero */}
      <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-accent/15 px-4 py-3 sm:px-5 sm:py-4">
          <span
            className={`whitespace-nowrap font-mono font-bold text-accent ${
              fault.code.length > 8
                ? "text-lg sm:text-xl"
                : fault.code.length > 5
                  ? "text-xl sm:text-2xl"
                  : "text-2xl sm:text-3xl"
            }`}
          >
            {fault.code}
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-technical-50 sm:text-2xl">
            <TranslatedTitle />
          </h1>
          <p className="mt-0.5 text-xs text-technical-400">
            {fault.manual.brand.name} &middot; {displayName}
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Quick Action Card */}
        <aside className="lg:col-span-1">
          <div className="sticky top-4 rounded-lg border border-accent/40 bg-technical-800 p-5">
            <div className="mb-3 flex items-center gap-2">
              <svg
                className="h-4 w-4 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
              <h2 className="text-base font-bold text-accent">
                {t("priorityFix", locale)}
              </h2>
            </div>
            <p className="mb-3 text-xs text-technical-400">
              {t("priorityFixSubtitle", locale)}
            </p>
            <TranslatedPrioritySteps />
            <TranslatedMoreSteps label={t("moreStepsBelow", locale)} />
          </div>
          <AdSlot slot="sidebar" className="mt-4" />
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-5">
          <section className="rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
            <h2 className="mb-3 text-lg font-bold text-technical-50">
              {t("whatDoesMean", locale)} {fault.code} {t("mean", locale)}
            </h2>
            <TranslatedDescription />
          </section>

          <section className="rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-technical-50">
              {t("completeGuide", locale)}
            </h2>
            <TranslatedFullSteps />
          </section>

          <AdSlot slot="content" />
        </div>
      </div>

      {/* Source Details */}
      <div className="mt-6 rounded-lg border border-technical-700 bg-technical-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-technical-400">
            <span className="font-medium text-technical-200">{t("sourceManual", locale)}</span>
            {" "}{fault.manual.name}
          </div>
          {(fault.sourceUrl || fault.manual.pdfUrl) && (
            <a
              href={fault.sourceUrl || fault.manual.pdfUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              {fault.sourcePage
                ? `Open Manual (Page ${fault.sourcePage})`
                : t("viewOfficialPDF", locale)}
            </a>
          )}
        </div>
      </div>
    </TranslatedContent>
    </div>
    </>
  );
}
