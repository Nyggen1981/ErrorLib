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
            ? `${manualsWithCodes.length} ${manualsWithCodes.length === 1 ? "manual" : "manuals"} with fault code documentation.`
            : "No fault codes available yet. Check back soon."}
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
          <p className="text-technical-500">
            No fault codes have been extracted for {brand.name} yet.
          </p>
          <p className="mt-1 text-sm text-technical-400">
            This brand is in the mining queue.
          </p>
        </div>
      )}
    </>
  );
}
