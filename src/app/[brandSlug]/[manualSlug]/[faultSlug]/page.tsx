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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
      <section className="mb-8 rounded-2xl border border-technical-200 bg-white p-6 sm:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex min-w-[5rem] shrink-0 items-center justify-center rounded-xl bg-technical-900 px-4 py-5 sm:min-w-[6rem] sm:py-6">
            <span
              className={`whitespace-nowrap font-mono font-bold text-white ${
                fault.code.length > 8
                  ? "text-base sm:text-lg"
                  : fault.code.length > 5
                    ? "text-xl sm:text-2xl"
                    : "text-2xl sm:text-3xl"
              }`}
            >
              {fault.code}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              <TranslatedTitle />
            </h1>
            <p className="mt-1 text-sm text-technical-400">
              {fault.manual.brand.name} &middot; {displayName}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Quick Action Card */}
        <aside className="lg:col-span-1">
          <div className="sticky top-8 rounded-2xl border-2 border-accent bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg
                className="h-5 w-5 text-accent"
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
              <h2 className="text-lg font-bold text-accent">
                {t("priorityFix", locale)}
              </h2>
            </div>
            <p className="mb-4 text-sm text-technical-500">
              {t("priorityFixSubtitle", locale)}
            </p>
            <TranslatedPrioritySteps />
            <TranslatedMoreSteps label={t("moreStepsBelow", locale)} />
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <section className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
            <h2 className="mb-4 text-xl font-bold">
              {t("whatDoesMean", locale)} {fault.code} {t("mean", locale)}
            </h2>
            <TranslatedDescription />
          </section>

          <section className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold">
              {t("completeGuide", locale)}
            </h2>
            <TranslatedFullSteps />
          </section>
        </div>
      </div>

      {/* Source link */}
      {(fault.sourceUrl || fault.manual.pdfUrl) && (
        <div className="mt-12 border-t border-technical-100 pt-4 text-center">
          <a
            href={fault.sourceUrl || fault.manual.pdfUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-technical-400 transition hover:text-technical-600"
          >
            {t("sourceManual", locale)} {fault.manual.brand.name} Manual
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      )}
    </TranslatedContent>
    </div>
    </>
  );
}
