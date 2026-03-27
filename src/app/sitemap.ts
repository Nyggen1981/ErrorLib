import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE = "https://errorlib.net";

/** Longest DB work on large catalogs (Vercel / serverless). */
export const maxDuration = 120;

/** Maks URL-er pr. sitemap (Google-grense 50 000; margin). */
const MAX_URLS_PER_SITEMAP = 45_000;

type SitemapArgs = { id?: Promise<string> };

export async function generateSitemaps() {
  const [brandCount, manualCount, faultCount] = await Promise.all([
    prisma.brand.count(),
    prisma.manual.count(),
    prisma.faultCode.count(),
  ]);

  const staticAndNavApprox = 4 + brandCount;
  const totalApprox = staticAndNavApprox + manualCount + faultCount;

  if (totalApprox <= MAX_URLS_PER_SITEMAP) {
    return [{ id: "0" }];
  }

  const brands = await prisma.brand.findMany({
    select: { id: true },
    orderBy: { slug: "asc" },
  });

  return [{ id: "0" }, ...brands.map((_, i) => ({ id: String(i + 1) }))];
}

function staticEntries(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

async function buildLastModMaps() {
  const [faultAgg, manualsMini] = await Promise.all([
    prisma.faultCode.groupBy({
      by: ["manualId"],
      _max: { updatedAt: true },
    }),
    prisma.manual.findMany({ select: { id: true, brandId: true } }),
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
  props: SitemapArgs
): Promise<MetadataRoute.Sitemap> {
  const idRaw = props.id != null ? await props.id : "0";
  const shard = Number(idRaw);

  const [brands, manualCount, faultCount, maps] = await Promise.all([
    prisma.brand.findMany({ orderBy: { slug: "asc" } }),
    prisma.manual.count(),
    prisma.faultCode.count(),
    buildLastModMaps(),
  ]);

  const { faultMaxTimeByManual, faultMaxTimeByBrand } = maps;
  const staticAndNavApprox = 4 + brands.length;
  const totalApprox = staticAndNavApprox + manualCount + faultCount;
  const useShards = totalApprox > MAX_URLS_PER_SITEMAP;

  if (!useShards) {
    const manuals = await prisma.manual.findMany({
      include: { brand: { select: { slug: true } } },
      orderBy: [{ brandId: "asc" }, { slug: "asc" }],
    });
    const faultCodes = await prisma.faultCode.findMany({
      include: {
        manual: { include: { brand: { select: { slug: true } } } },
      },
      orderBy: [{ manualId: "asc" }, { code: "asc" }],
    });

    const entries: MetadataRoute.Sitemap = [...staticEntries()];

    for (const b of brands) {
      const faultMax = faultMaxTimeByBrand.get(b.id);
      const lastModified =
        faultMax != null
          ? new Date(Math.max(b.updatedAt.getTime(), faultMax))
          : b.updatedAt;
      entries.push({
        url: `${BASE}/${b.slug}`,
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
        url: `${BASE}/${m.brand.slug}/${m.slug}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const fc of faultCodes) {
      entries.push({
        url: `${BASE}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
        lastModified: fc.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    return entries;
  }

  if (shard === 0) {
    const manuals = await prisma.manual.findMany({
      include: { brand: { select: { slug: true } } },
      orderBy: [{ brandId: "asc" }, { slug: "asc" }],
    });

    const entries: MetadataRoute.Sitemap = [...staticEntries()];

    for (const b of brands) {
      const faultMax = faultMaxTimeByBrand.get(b.id);
      const lastModified =
        faultMax != null
          ? new Date(Math.max(b.updatedAt.getTime(), faultMax))
          : b.updatedAt;
      entries.push({
        url: `${BASE}/${b.slug}`,
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
        url: `${BASE}/${m.brand.slug}/${m.slug}`,
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
    where: { manual: { brandId: brand.id } },
    include: {
      manual: { include: { brand: { select: { slug: true } } } },
    },
    orderBy: [{ manualId: "asc" }, { code: "asc" }],
  });

  return faultCodes.map((fc) => ({
    url: `${BASE}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
    lastModified: fc.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
}
