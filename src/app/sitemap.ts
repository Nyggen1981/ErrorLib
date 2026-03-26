import { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const BASE = "https://errorlib.net";
const CHUNK_SIZE = 1000;
const REVALIDATE_SECONDS = 60 * 60;

export const revalidate = REVALIDATE_SECONDS;

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

const getCachedSiteUrls = unstable_cache(
  async (): Promise<MetadataRoute.Sitemap> => {
    const [brands, activeLangs] = await Promise.all([
      prisma.brand.findMany({
        include: {
          manuals: {
            where: { faultCodes: { some: {} } },
            select: {
              slug: true,
              updatedAt: true,
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
        const manualPath = `/${brand.slug}/${manual.slug}`;
        entries.push({
          url: `${BASE}${manualPath}`,
          lastModified: manual.updatedAt,
          changeFrequency: "weekly",
          priority: 0.7,
          alternates: buildAlternates(manualPath, activeLangs),
        });
      }
    }

    return entries;
  },
  ["sitemap-site-urls"],
  { revalidate: REVALIDATE_SECONDS }
);

const getCachedFaultCodeChunk = unstable_cache(
  async (chunkId: number): Promise<MetadataRoute.Sitemap> => {
    const [faultCodes, activeLangs] = await Promise.all([
      prisma.faultCode.findMany({
        select: {
          slug: true,
          updatedAt: true,
          manual: {
            select: {
              slug: true,
              brand: {
                select: { slug: true },
              },
            },
          },
        },
        orderBy: { id: "asc" },
        skip: chunkId * CHUNK_SIZE,
        take: CHUNK_SIZE,
      }),
      getActiveLanguages(),
    ]);

    return faultCodes.map((fc) => {
      const faultPath = `/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`;
      return {
        url: `${BASE}${faultPath}`,
        lastModified: fc.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: buildAlternates(faultPath, activeLangs),
      };
    });
  },
  ["sitemap-fault-code-chunks"],
  { revalidate: REVALIDATE_SECONDS }
);

const getCachedFaultCodeCount = unstable_cache(
  async (): Promise<number> => prisma.faultCode.count(),
  ["sitemap-fault-code-count"],
  { revalidate: REVALIDATE_SECONDS }
);

export async function generateSitemaps() {
  const faultCodeCount = await getCachedFaultCodeCount();
  const faultChunks = Math.ceil(faultCodeCount / CHUNK_SIZE);

  return [
    { id: 0 },
    ...Array.from({ length: faultChunks }, (_, idx) => ({ id: idx + 1 })),
  ];
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  if (id === 0) {
    return getCachedSiteUrls();
  }

  const faultChunkId = id - 1;
  return getCachedFaultCodeChunk(faultChunkId);
}
