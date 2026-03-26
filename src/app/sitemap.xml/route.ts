import { unstable_cache } from "next/cache";

const BASE = "https://errorlib.net";
const CHUNK_SIZE = 1000;
const REVALIDATE_SECONDS = 60 * 60;

export const revalidate = 3600;

const getCachedFaultCodeCount = unstable_cache(
  async (): Promise<number> => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.faultCode.count();
  },
  ["sitemap-index-fault-code-count"],
  { revalidate: REVALIDATE_SECONDS }
);

export async function GET() {
  const faultCodeCount = await getCachedFaultCodeCount();
  const chunkCount = Math.max(1, Math.ceil(faultCodeCount / CHUNK_SIZE));

  const urls = Array.from({ length: chunkCount + 1 }, (_, index) => {
    return `${BASE}/sitemap/${index}.xml`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => `  <sitemap><loc>${url}</loc></sitemap>`)
  .join("\n")}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
