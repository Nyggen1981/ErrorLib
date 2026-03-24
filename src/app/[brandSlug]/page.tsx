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
    if (family.length >= 3) break;
    if (/^[A-Z0-9]/.test(word) && word.length >= 2) {
      family.push(word);
    } else if (family.length > 0) {
      break;
    }
  }

  if (family.length === 0) return cleanedTitle.split(/\s+/).slice(0, 2).join(" ");
  return family.join(" ");
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
  cleanTitles: string[];
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

    const existing = groups.get(family);
    if (existing) {
      existing.manuals.push(manual);
      existing.totalCodes += manual._count.faultCodes;
      if (!existing.cleanTitles.includes(cleaned)) {
        existing.cleanTitles.push(cleaned);
      }
    } else {
      groups.set(family, {
        family,
        manuals: [manual],
        totalCodes: manual._count.faultCodes,
        cleanTitles: [cleaned],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.family.localeCompare(b.family)
  );
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

            return (
              <div
                key={group.family}
                className="group rounded-xl border border-technical-200 bg-white p-6 transition-all hover:border-technical-300 hover:shadow-md"
              >
                <a
                  href={`/${brand.slug}/${primary.slug}`}
                  className="block"
                >
                  <h2 className="text-xl font-bold tracking-tight group-hover:text-accent transition-colors">
                    {group.family}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-technical-600">
                    {group.totalCodes} fault{" "}
                    {group.totalCodes === 1 ? "code" : "codes"}
                  </p>
                </a>

                {group.manuals.length > 1 && (
                  <div className="mt-3 border-t border-technical-100 pt-3">
                    <p className="mb-2 text-xs text-technical-400">
                      From {group.manuals.length} manuals:
                    </p>
                    <div className="space-y-1">
                      {group.manuals.map((m) => (
                        <a
                          key={m.id}
                          href={`/${brand.slug}/${m.slug}`}
                          className="flex items-center justify-between rounded px-2 py-1 text-xs transition hover:bg-technical-50"
                        >
                          <span className="truncate text-technical-500 hover:text-accent">
                            {cleanTitle(m.name, brand.name)}
                          </span>
                          <span className="ml-2 shrink-0 tabular-nums text-technical-400">
                            {m._count.faultCodes}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
