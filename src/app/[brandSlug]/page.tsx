import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { Metadata } from "next";

type Props = { params: Promise<{ brandSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) return {};
  return {
    title: `${brand.name} Fault Codes & Manuals`,
    description: `Browse all ${brand.name} manuals and fault codes. Find troubleshooting guides for ${brand.name} industrial equipment.`,
  };
}

export default async function BrandPage({ params }: Props) {
  const { brandSlug } = await params;
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

  const manualsWithCodes = brand.manuals.filter(
    (m) => m._count.faultCodes > 0
  );
  const emptyManuals = brand.manuals.filter(
    (m) => m._count.faultCodes === 0
  );

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: brand.name }]}
      />

      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {brand.name}
        </h1>
        <p className="mt-3 text-lg text-technical-500">
          {manualsWithCodes.length > 0
            ? "Select a manual to view its fault codes and troubleshooting guides."
            : "Manuals are being processed. Check back soon for fault codes."}
        </p>
      </div>

      {manualsWithCodes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {manualsWithCodes.map((manual) => (
            <a
              key={manual.id}
              href={`/${brand.slug}/${manual.slug}`}
              className="group rounded-xl border border-technical-200 bg-white p-6 transition-all hover:border-technical-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold group-hover:text-accent transition-colors">
                {manual.name}
              </h2>
              <p className="mt-1 text-sm text-technical-400">
                {manual._count.faultCodes} fault{" "}
                {manual._count.faultCodes === 1 ? "code" : "codes"}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-technical-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-technical-100">
            <svg
              className="h-6 w-6 text-technical-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-technical-500">
            Fault codes are being extracted from {brand.name} manuals.
          </p>
          <p className="mt-1 text-sm text-technical-400">
            Run the mining rig to populate this section.
          </p>
        </div>
      )}

      {emptyManuals.length > 0 && manualsWithCodes.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-sm font-medium text-technical-400">
            Processing ({emptyManuals.length} more{" "}
            {emptyManuals.length === 1 ? "manual" : "manuals"} pending
            extraction)
          </p>
          <div className="flex flex-wrap gap-2">
            {emptyManuals.map((m) => (
              <span
                key={m.id}
                className="rounded-full bg-technical-100 px-3 py-1 text-xs text-technical-400"
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
