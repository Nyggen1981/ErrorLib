import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const BASE = "https://errorlib.net";
const CHUNK_SIZE = 1000;
const REVALIDATE_SECONDS = 60 * 60;

export const revalidate = 3600;

async function getActiveLanguages(): Promise<Locale[]> {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "active_languages" },
    });
    if (setting) return JSON.parse(setting.value) as Locale[];
  } catch {}
  return ["en"];
}

function buildAltLinks(path: string, langs: Locale[]) {
  if (langs.length <= 1) return "";
  return langs
    .map(
      (lang) =>
        `    <xhtml:link rel="alternate" hreflang="${lang}" href="${BASE}${path}" />`
    )
    .concat(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}${path}" />`
    )
    .join("\n");
}

const getCachedSiteEntries = unstable_cache(
  async () => {
    const [brands, activeLangs] = await Promise.all([
      prisma.brand.findMany({
        include: {
          manuals: {
            where: { faultCodes: { some: {} } },
            select: { slug: true, updatedAt: true },
          },
        },
      }),
      getActiveLanguages(),
    ]);

    const entries: Array<{ path: string; lastmod?: Date; priority?: number }> = [
      { path: "/", priority: 1 },
      { path: "/about", priority: 0.4 },
      { path: "/privacy", priority: 0.2 },
      { path: "/terms", priority: 0.2 },
    ];

    for (const brand of brands) {
      entries.push({
        path: `/${brand.slug}`,
        lastmod: brand.updatedAt,
        priority: 0.8,
      });

      for (const manual of brand.manuals) {
        entries.push({
          path: `/${brand.slug}/${manual.slug}`,
          lastmod: manual.updatedAt,
          priority: 0.7,
        });
      }
    }

    return { entries, activeLangs };
  },
  ["sitemap-route-site-entries"],
  { revalidate: REVALIDATE_SECONDS }
);

const getCachedFaultEntries = unstable_cache(
  async (chunkId: number) => {
    const [faultCodes, activeLangs] = await Promise.all([
      prisma.faultCode.findMany({
        select: {
          slug: true,
          updatedAt: true,
          manual: {
            select: {
              slug: true,
              brand: { select: { slug: true } },
            },
          },
        },
        orderBy: { id: "asc" },
        skip: chunkId * CHUNK_SIZE,
        take: CHUNK_SIZE,
      }),
      getActiveLanguages(),
    ]);

    return {
      entries: faultCodes.map((fc) => ({
        path: `/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
        lastmod: fc.updatedAt,
        priority: 0.6,
      })),
      activeLangs,
    };
  },
  ["sitemap-route-fault-entries"],
  { revalidate: REVALIDATE_SECONDS }
);

function toUrlSetXml(
  entries: Array<{ path: string; lastmod?: Date; priority?: number }>,
  langs: Locale[]
) {
  const body = entries
    .map((entry) => {
      const altLinks = buildAltLinks(entry.path, langs);
      const lastmod = entry.lastmod
        ? `\n    <lastmod>${entry.lastmod.toISOString()}</lastmod>`
        : "";
      const priority =
        typeof entry.priority === "number"
          ? `\n    <priority>${entry.priority.toFixed(1)}</priority>`
          : "";

      return `  <url>
    <loc>${BASE}${entry.path}</loc>${lastmod}${priority}${
        altLinks ? `\n${altLinks}` : ""
      }
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>`;
}

export async function GET(request: Request) {
  const pathname = new URL(request.url).pathname;
  const idMatch = pathname.match(/\/sitemap\/(\d+)\.xml$/);
  const normalizedId = idMatch ? Number(idMatch[1]) : Number.NaN;

  if (!Number.isFinite(normalizedId) || normalizedId < 0) {
    return new Response("Not Found", { status: 404 });
  }

  const data =
    normalizedId === 0
      ? await getCachedSiteEntries()
      : await getCachedFaultEntries(normalizedId - 1);

  const xml = toUrlSetXml(data.entries, data.activeLangs);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
