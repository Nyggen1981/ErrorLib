import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TranslatedContent } from "@/components/TranslatedContent";
import {
  TranslatedTitle,
  TranslatedDescription,
  TranslatedAllSteps,
  TranslatedCauses,
  TranslatedTools,
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
    include: { manual: { include: { brand: true, _count: { select: { faultCodes: true } } } } },
  });

  if (
    !fault ||
    fault.manual.slug !== manualSlug ||
    fault.manual.brand.slug !== brandSlug
  )
    notFound();

  const displayName = stripBrand(fault.manual.name, fault.manual.brand.name);
  const manualCodesCount = fault.manual._count.faultCodes;
  const manualCodesHref = `/${fault.manual.brand.slug}/${fault.manual.slug}`;

  const englishContent = {
    title: fault.title,
    description: fault.description,
    fixSteps: fault.fixSteps,
    causes: fault.causes,
    requiredTools: fault.requiredTools,
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

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What does ${brandName} fault code ${fault.code} mean?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: fault.description,
        },
      },
      ...(fault.causes.length > 0
        ? [
            {
              "@type": "Question",
              name: `What causes ${brandName} error ${fault.code}?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: fault.causes.join(". "),
              },
            },
          ]
        : []),
      {
        "@type": "Question",
        name: `How do you fix ${brandName} fault code ${fault.code}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: fault.fixSteps.map((s, i) => `${i + 1}. ${s}`).join(" "),
        },
      },
    ],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
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

          {/* Hero */}
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

          {/* Description */}
          <section className="mb-5 rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
            <h2 className="mb-3 text-lg font-bold text-technical-50">
              {t("whatDoesMean", locale)} {fault.code} {t("mean", locale)}
            </h2>
            <TranslatedDescription />
          </section>

          {/* Causes */}
          <TranslatedCauses heading={t("commonCauses", locale)} />

          {/* Required Tools */}
          <TranslatedTools heading={t("requiredTools", locale)} />

          {/* All Steps */}
          <section className="mb-5 rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg
                className="h-4.5 w-4.5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.42 15.17l-5.1-3.07a1 1 0 01-.42-.82V5.58a1 1 0 01.42-.82l5.1-3.07a1 1 0 011.16 0l5.1 3.07a1 1 0 01.42.82v5.7a1 1 0 01-.42.82l-5.1 3.07a1 1 0 01-1.16 0z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 22v-6" />
              </svg>
              <h2 className="text-lg font-bold text-technical-50">
                {t("repairSteps", locale)}
              </h2>
            </div>
            <TranslatedAllSteps />

            {manualCodesCount > 1 && (
              <a
                href={manualCodesHref}
                className="mt-4 flex items-center gap-2 rounded-lg border border-technical-600 bg-technical-900/50 p-3 text-sm font-medium text-accent transition hover:border-accent/40 hover:bg-accent/5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                {t("browseAllCodes", locale)} ({manualCodesCount})
              </a>
            )}
          </section>

          {/* Metadata badge */}
          <div className="mb-5 flex items-center gap-2 rounded-md border border-technical-700 bg-technical-800/50 px-3 py-2 text-[11px] text-technical-400">
            <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("verifiedData", locale)} {fault.updatedAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>

          <AdSlot slot="content" />

          {/* Source Details */}
          <div className="mt-5 rounded-lg border border-technical-700 bg-technical-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-technical-400">
                <span className="font-medium text-technical-200">{t("sourceManual", locale)}</span>
                {" "}{fault.manual.name}
              </div>
              <div className="flex items-center gap-2">
                {(fault.sourceUrl || fault.manual.pdfUrl) && !fault.manual.isBroken ? (
                  <>
                    <a
                      href={`/manuals/${fault.manual.id}${fault.sourcePage ? `?page=${fault.sourcePage}` : ""}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      {fault.sourcePage
                        ? `Open Manual (Page ${fault.sourcePage})`
                        : t("viewOfficialPDF", locale)}
                    </a>
                    <a
                      href={manualCodesHref}
                      className="inline-flex items-center gap-1 rounded-md border border-technical-600 px-2.5 py-1.5 text-[11px] text-technical-300 transition hover:border-technical-500 hover:text-white"
                    >
                      {t("searchMoreCodes", locale)}
                    </a>
                  </>
                ) : fault.manual.isBroken ? (
                  <span className="text-[10px] text-technical-400">
                    {t("sourceUnderMaintenance", locale)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </TranslatedContent>
      </div>
    </>
  );
}
