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
  return {
    title: `${manual.brand.name} ${display} - All Fault Codes`,
    description: `Complete list of fault codes for the ${manual.brand.name} ${display}. Step-by-step troubleshooting guides for every error.`,
  };
}

export default async function ManualPage({ params }: Props) {
  const { brandSlug, manualSlug } = await params;
  const locale = await getLocale();

  const manual = await prisma.manual.findUnique({
    where: { slug: manualSlug },
    include: {
      brand: true,
      faultCodes: { orderBy: { code: "asc" } },
    },
  });

  if (!manual || manual.brand.slug !== brandSlug) notFound();

  const displayName = stripBrand(manual.name, manual.brand.name);

  return (
    <>
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
          {manual.faultCodes.map((fc) => (
            <FaultCodeCard
              key={fc.id}
              code={fc.code}
              title={fc.title}
              description={fc.description}
              href={`/${manual.brand.slug}/${manual.slug}/${fc.slug}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
