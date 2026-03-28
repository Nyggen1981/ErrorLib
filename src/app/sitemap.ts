import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

/** Revalidate sitemap periodically (seconds). */
export const revalidate = 3600;

export const maxDuration = 120;

const MAX_URLS_PER_SITEMAP = 45_000;

const manualWhere = { isBroken: false };

type SitemapProps = { id?: Promise<string | undefined> };

export async function generateSitemaps() {
  const [brandCount, manualCount, faultCount] = await Promise.all([
    prisma.brand.count(),
    prisma.manual.count({ where: manualWhere }),
    prisma.faultCode.count({ where: { manual: manualWhere } }),
  ]);

  const staticAndNavApprox = 4 + brandCount;
  const totalApprox = staticAndNavApprox + manualCount + faultCount;

  if (totalApprox <= MAX_URLS_PER_SITEMAP) {
    return [{ id: 0 }];
  }

  const brands = await prisma.brand.findMany({
    select: { id: true },
    orderBy: { slug: "asc" },
  });

  return [{ id: 0 }, ...brands.map((_, i) => ({ id: i + 1 }))];
}

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

export default async function sitemap(
  props: SitemapProps
): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const idRaw = props.id != null ? await props.id : undefined;
  const shard =
    idRaw === undefined || idRaw === ""
      ? 0
      : Number.parseInt(String(idRaw).replace(/\.xml$/i, ""), 10);

  const [brands, manualCount, faultCount, maps] = await Promise.all([
    prisma.brand.findMany({ orderBy: { slug: "asc" } }),
    prisma.manual.count({ where: manualWhere }),
    prisma.faultCode.count({ where: { manual: manualWhere } }),
    buildLastModMaps(),
  ]);

  const { faultMaxTimeByManual, faultMaxTimeByBrand } = maps;
  const staticAndNavApprox = 4 + brands.length;
  const totalApprox = staticAndNavApprox + manualCount + faultCount;
  const useShards = totalApprox > MAX_URLS_PER_SITEMAP;

  const manualQuery = {
    where: manualWhere,
    include: { brand: { select: { slug: true } } },
    orderBy: [{ brandId: "asc" as const }, { slug: "asc" as const }],
  };

  const faultQuery = {
    where: { manual: manualWhere },
    include: {
      manual: { include: { brand: { select: { slug: true } } } },
    },
    orderBy: [{ manualId: "asc" as const }, { code: "asc" as const }],
  };

  if (!useShards) {
    const manuals = await prisma.manual.findMany(manualQuery);
    const faultCodes = await prisma.faultCode.findMany(faultQuery);

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

    return entries;
  }

  if (shard === 0) {
    const manuals = await prisma.manual.findMany(manualQuery);

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

    return entries;
  }

  const brand = brands[shard - 1];
  if (!brand) return [];

  const faultCodes = await prisma.faultCode.findMany({
    where: { manual: { isBroken: false, brandId: brand.id } },
    include: {
      manual: { include: { brand: { select: { slug: true } } } },
    },
    orderBy: [{ manualId: "asc" }, { code: "asc" }],
  });

  return faultCodes.map((fc) => ({
    url: `${base}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
    lastModified: fc.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
}
