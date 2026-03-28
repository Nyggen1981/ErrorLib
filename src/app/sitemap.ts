import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Single sitemap at /sitemap.xml (do not use generateSitemaps() here: with that
 * export, Next only serves shard URLs under /sitemap/[id].xml and /sitemap.xml
 * for the index can 404 when the route params do not match).
 */
export const revalidate = 3600;

export const maxDuration = 120;

/** Google max URLs per sitemap file; cap if catalog grows huge. */
const MAX_URLS = 45_000;

const manualWhere = { isBroken: false };

function staticEntries(base: string): MetadataRoute.Sitemap {
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

async function buildLastModMaps() {
  const [faultAgg, manualsMini] = await Promise.all([
    prisma.faultCode.groupBy({
      by: ["manualId"],
      _max: { updatedAt: true },
      where: { manual: manualWhere },
    }),
    prisma.manual.findMany({
      where: manualWhere,
      select: { id: true, brandId: true },
    }),
  ]);

  const manualToBrand = new Map(manualsMini.map((m) => [m.id, m.brandId]));
  const faultMaxTimeByManual = new Map<string, number>();
  const faultMaxTimeByBrand = new Map<string, number>();

  for (const g of faultAgg) {
    const t = g._max.updatedAt!.getTime();
    faultMaxTimeByManual.set(g.manualId, t);
    const bid = manualToBrand.get(g.manualId);
    if (bid != null) {
      faultMaxTimeByBrand.set(
        bid,
        Math.max(faultMaxTimeByBrand.get(bid) ?? 0, t)
      );
    }
  }

  return { faultMaxTimeByManual, faultMaxTimeByBrand };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const [brands, maps] = await Promise.all([
    prisma.brand.findMany({ orderBy: { slug: "asc" } }),
    buildLastModMaps(),
  ]);
  const { faultMaxTimeByManual, faultMaxTimeByBrand } = maps;

  const manuals = await prisma.manual.findMany({
    where: manualWhere,
    include: { brand: { select: { slug: true } } },
    orderBy: [{ brandId: "asc" }, { slug: "asc" }],
  });

  const faultCodes = await prisma.faultCode.findMany({
    where: { manual: manualWhere },
    include: {
      manual: { include: { brand: { select: { slug: true } } } },
    },
    orderBy: [{ manualId: "asc" }, { code: "asc" }],
  });

  const entries: MetadataRoute.Sitemap = [...staticEntries(base)];

  for (const b of brands) {
    const faultMax = faultMaxTimeByBrand.get(b.id);
    const lastModified =
      faultMax != null
        ? new Date(Math.max(b.updatedAt.getTime(), faultMax))
        : b.updatedAt;
    entries.push({
      url: `${base}/${b.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  for (const m of manuals) {
    const faultMax = faultMaxTimeByManual.get(m.id);
    const lastModified =
      faultMax != null
        ? new Date(Math.max(m.updatedAt.getTime(), faultMax))
        : m.updatedAt;
    entries.push({
      url: `${base}/${m.brand.slug}/${m.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const fc of faultCodes) {
    entries.push({
      url: `${base}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
      lastModified: fc.updatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  if (entries.length > MAX_URLS) {
    return entries.slice(0, MAX_URLS);
  }

  return entries;
}
