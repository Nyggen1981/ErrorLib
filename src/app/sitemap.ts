import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE = "https://errorlib.net";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brands = await prisma.brand.findMany({
    include: {
      manuals: {
        include: {
          faultCodes: { select: { slug: true, updatedAt: true } },
        },
      },
    },
  });

  const entries: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];

  for (const brand of brands) {
    entries.push({
      url: `${BASE}/${brand.slug}`,
      lastModified: brand.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    });

    for (const manual of brand.manuals) {
      if (manual.faultCodes.length === 0) continue;

      entries.push({
        url: `${BASE}/${brand.slug}/${manual.slug}`,
        lastModified: manual.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });

      for (const fc of manual.faultCodes) {
        entries.push({
          url: `${BASE}/${brand.slug}/${manual.slug}/${fc.slug}`,
          lastModified: fc.updatedAt,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  }

  return entries;
}
