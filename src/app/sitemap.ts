import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const BASE = "https://errorlib.net";

async function getActiveLanguages(): Promise<Locale[]> {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "active_languages" },
    });
    if (setting) return JSON.parse(setting.value) as Locale[];
  } catch {}
  return ["en"];
}

function buildAlternates(path: string, langs: Locale[]) {
  if (langs.length <= 1) return undefined;
  const languages: Record<string, string> = {};
  for (const lang of langs) {
    languages[lang] = `${BASE}${path}`;
  }
  languages["x-default"] = `${BASE}${path}`;
  return { languages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [brands, activeLangs] = await Promise.all([
    prisma.brand.findMany({
      include: {
        manuals: {
          include: {
            faultCodes: { select: { slug: true, updatedAt: true } },
          },
        },
      },
    }),
    getActiveLanguages(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
      alternates: buildAlternates("/", activeLangs),
    },
  ];

  for (const brand of brands) {
    const brandPath = `/${brand.slug}`;
    entries.push({
      url: `${BASE}${brandPath}`,
      lastModified: brand.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: buildAlternates(brandPath, activeLangs),
    });

    for (const manual of brand.manuals) {
      if (manual.faultCodes.length === 0) continue;

      const manualPath = `/${brand.slug}/${manual.slug}`;
      entries.push({
        url: `${BASE}${manualPath}`,
        lastModified: manual.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: buildAlternates(manualPath, activeLangs),
      });

      for (const fc of manual.faultCodes) {
        const faultPath = `/${brand.slug}/${manual.slug}/${fc.slug}`;
        entries.push({
          url: `${BASE}${faultPath}`,
          lastModified: fc.updatedAt,
          changeFrequency: "monthly",
          priority: 0.6,
          alternates: buildAlternates(faultPath, activeLangs),
        });
      }
    }
  }

  return entries;
}
