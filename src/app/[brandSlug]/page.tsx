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

const STRIP_SUFFIXES = [
  /\b(list|manual|guide|handbook|reference|instruction)\b/gi,
  /\b(diagnostics?\s*(and|&)?\s*alarms?)\b/gi,
  /\b(faults?\s*(and|&)?\s*alarms?)\b/gi,
  /\b(variable\s+speed\s+drive)\b/gi,
  /\b(general\s+purpose\s+drive)\b/gi,
  /\b(frequency\s+(inverter|converter|drive))\b/gi,
  /\b(programming|technical|user)\s+(guide|manual)\b/gi,
  /\b(cnc\s+control)\b/gi,
  /\bcontroller\b/gi,
];

function cleanTitle(name: string, brandName: string): string {
  let clean = name;

  const brandWords = brandName.split(/\s+/);
  for (const word of brandWords) {
    clean = clean.replace(new RegExp(`^${word}\\s*`, "i"), "");
  }

  for (const re of STRIP_SUFFIXES) {
    clean = clean.replace(re, "");
  }

  clean = clean.replace(/[,\-–—]+\s*$/, "").replace(/\s+/g, " ").trim();

  return clean || name;
}

function extractModelFamily(cleanedTitle: string): string {
  const words = cleanedTitle.split(/\s+/);
  const family: string[] = [];

  for (const word of words) {
    if (family.length >= 2) break;
    if (/^[A-Z0-9]/.test(word) && word.length >= 2) {
      family.push(word);
    } else if (family.length > 0) {
      break;
    }
  }

  if (family.length === 0) return cleanedTitle.split(/\s+/).slice(0, 2).join(" ");
  return family.join(" ");
}

function variantLabel(cleanedTitle: string, family: string): string {
  return cleanedTitle
    .replace(family, "")
    .replace(/^[\s,\-–—]+/, "")
    .replace(/[\s,\-–—]+$/, "")
    .trim();
}

type ManualWithCount = {
  id: string;
  name: string;
  slug: string;
  _count: { faultCodes: number };
};

type ModelGroup = {
  family: string;
  manuals: ManualWithCount[];
  totalCodes: number;
  variants: string[];
};

function groupManuals(
  manuals: ManualWithCount[],
  brandName: string
): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();

  for (const manual of manuals) {
    if (manual._count.faultCodes === 0) continue;

    const cleaned = cleanTitle(manual.name, brandName);
    const family = extractModelFamily(cleaned);
    const variant = variantLabel(cleaned, family);

    const existing = groups.get(family);
    if (existing) {
      existing.manuals.push(manual);
      existing.totalCodes += manual._count.faultCodes;
      if (variant && !existing.variants.includes(variant)) {
        existing.variants.push(variant);
      }
    } else {
      groups.set(family, {
        family,
        manuals: [manual],
        totalCodes: manual._count.faultCodes,
        variants: variant ? [variant] : [],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.totalCodes - a.totalCodes);
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

  const groups = groupManuals(brand.manuals, brand.name);
  const totalCodes = groups.reduce((s, g) => s + g.totalCodes, 0);

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
          {groups.length > 0
            ? `${groups.length} model ${groups.length === 1 ? "family" : "families"} \u00B7 ${totalCodes} fault codes`
            : "No fault codes available yet. Check back soon."}
        </p>
      </div>

      {groups.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const primary = group.manuals.reduce((best, m) =>
              m._count.faultCodes > best._count.faultCodes ? m : best
            );
            const manualCount = group.manuals.length;
            const hasVariants = group.variants.length > 0;

            return (
              <a
                key={group.family}
                href={`/${brand.slug}/${primary.slug}`}
                className="group flex flex-col rounded-xl border border-technical-200 bg-white p-6 transition-all hover:border-technical-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-tight group-hover:text-accent transition-colors">
                    {group.family}
                  </h2>
                  {manualCount > 1 && (
                    <span className="shrink-0 rounded-full bg-technical-100 px-2.5 py-0.5 text-xs font-medium text-technical-600">
                      {manualCount} manuals
                    </span>
                  )}
                </div>

                <p className="mt-2 text-lg font-semibold tabular-nums text-technical-700">
                  {group.totalCodes}{" "}
                  <span className="text-sm font-normal text-technical-400">
                    fault {group.totalCodes === 1 ? "code" : "codes"}
                  </span>
                </p>

                {hasVariants && (
                  <p className="mt-2 text-xs text-technical-400">
                    Includes {group.variants.slice(0, 4).join(", ")}
                    {group.variants.length > 4
                      ? ` +${group.variants.length - 4} more`
                      : ""}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-technical-300 bg-white p-12 text-center">
          <p className="text-technical-500">
            No fault codes have been extracted for {brand.name} yet.
          </p>
          <p className="mt-1 text-sm text-technical-400">
            Documentation is currently being indexed.
          </p>
        </div>
      )}
    </>
  );
}
