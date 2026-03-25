import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FaultCodeCard } from "@/components/FaultCodeCard";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import type { Metadata } from "next";

type Props = { params: Promise<{ brandSlug: string; manualSlug: string }> };

function stripBrand(manualName: string, brandName: string): string {
  const re = new RegExp(`^${brandName}\\s+`, "i");
  return manualName.replace(re, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brandSlug, manualSlug } = await params;
  const manual = await prisma.manual.findUnique({
    where: { slug: manualSlug },
    include: { brand: true },
  });
  if (!manual || manual.brand.slug !== brandSlug) return {};
  const display = stripBrand(manual.name, manual.brand.name);
  const title = `${manual.brand.name} ${display} Fault Codes — Complete Error List`;
  const description = `All fault codes for the ${manual.brand.name} ${display}. Causes, descriptions, and step-by-step troubleshooting for every error code.`;
  const url = `/${manual.brand.slug}/${manual.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url },
  };
}

export default async function ManualPage({ params }: Props) {
  const { brandSlug, manualSlug } = await params;
  const locale = await getLocale();

  const manual = await prisma.manual.findUnique({
    where: { slug: manualSlug },
    include: {
      brand: true,
      faultCodes: {
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          slug: true,
          translations: true,
        },
      },
    },
  });

  if (!manual || manual.brand.slug !== brandSlug) notFound();

  const displayName = stripBrand(manual.name, manual.brand.name);

  type FaultCodeRow = (typeof manual.faultCodes)[number];
  type TranslationEntry = { title?: string; description?: string };
  type TranslationsMap = Record<string, TranslationEntry>;

  function localized(fc: FaultCodeRow) {
    if (locale === "en") return { title: fc.title, description: fc.description };
    const map = (fc.translations as TranslationsMap) ?? {};
    const tr = map[locale];
    return {
      title: tr?.title || fc.title,
      description: tr?.description || fc.description,
    };
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumbs
        items={[
          { label: t("home", locale), href: "/" },
          { label: manual.brand.name, href: `/${manual.brand.slug}` },
          { label: displayName },
        ]}
      />

      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {manual.brand.name} {displayName}
        </h1>
        <p className="mt-3 text-lg text-technical-500">
          {manual.faultCodes.length}{" "}
          {manual.faultCodes.length === 1 ? t("faultCode", locale) : t("faultCodes", locale)}{" "}
          {t("documented", locale)}
        </p>
      </div>

      {manual.faultCodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-technical-300 bg-white p-12 text-center">
          <p className="text-technical-400">
            {t("noFaultCodesManual", locale)}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {manual.faultCodes.map((fc) => {
            const loc = localized(fc);
            return (
              <FaultCodeCard
                key={fc.id}
                code={fc.code}
                title={loc.title}
                description={loc.description}
                href={`/${manual.brand.slug}/${manual.slug}/${fc.slug}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
