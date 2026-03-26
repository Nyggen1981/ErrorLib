import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE = "https://errorlib.net";

/** Longest DB work on large catalogs (Vercel / serverless). */
export const maxDuration = 120;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [brands, manuals, faultCodes] = await Promise.all([
    prisma.brand.findMany({ orderBy: { slug: "asc" } }),
    prisma.manual.findMany({
      include: { brand: { select: { slug: true } } },
      orderBy: [{ brandId: "asc" }, { slug: "asc" }],
    }),
    prisma.faultCode.findMany({
      include: {
        manual: { include: { brand: { select: { slug: true } } } },
      },
      orderBy: [{ manualId: "asc" }, { code: "asc" }],
    }),
  ]);

  const faultMaxTimeByManual = new Map<string, number>();
  const faultMaxTimeByBrand = new Map<string, number>();
  for (const fc of faultCodes) {
    const t = fc.updatedAt.getTime();
    const mid = fc.manualId;
    const bid = fc.manual.brandId;
    faultMaxTimeByManual.set(
      mid,
      Math.max(faultMaxTimeByManual.get(mid) ?? 0, t)
    );
    faultMaxTimeByBrand.set(
      bid,
      Math.max(faultMaxTimeByBrand.get(bid) ?? 0, t)
    );
  }

  const entries: MetadataRoute.Sitemap = [];

  entries.push(
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    {
      url: `${BASE}/about`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${BASE}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${BASE}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    }
  );

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
