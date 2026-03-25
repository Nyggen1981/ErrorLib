import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE_URL = process.env.SITE_URL || "https://errorlib.net";
const BATCH_SIZE = 100;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function getAuth() {
  const keyJson = process.env.GOOGLE_INDEXING_KEY;
  if (!keyJson) throw new Error("GOOGLE_INDEXING_KEY env var is missing");

  const key = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  });
  return auth;
}

async function pushUrls(urls: string[], auth: Awaited<ReturnType<typeof getAuth>>) {
  const indexing = google.indexing({ version: "v3", auth });
  const results: { url: string; ok: boolean; error?: string }[] = [];

  for (const url of urls) {
    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: "URL_UPDATED",
        },
      });
      results.push({ url, ok: true });
      console.log(`  ✓ ${url}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ url, ok: false, error: message });
      console.log(`  ✗ ${url} — ${message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

async function main() {
  console.log("🔎 Fetching un-indexed fault codes...");

  const codes = await prisma.faultCode.findMany({
    where: { isIndexed: false },
    orderBy: { createdAt: "desc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      slug: true,
      manual: {
        select: {
          slug: true,
          brand: { select: { slug: true } },
        },
      },
    },
  });

  if (codes.length === 0) {
    console.log("✅ All fault codes are already indexed.");
    return;
  }

  console.log(`📤 Pushing ${codes.length} URLs to Google Indexing API...`);

  const auth = await getAuth();
  const urls = codes.map(
    (fc) => `${BASE_URL}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`
  );

  const results = await pushUrls(urls, auth);

  const successIds = codes
    .filter((_, i) => results[i].ok)
    .map((fc) => fc.id);

  if (successIds.length > 0) {
    await prisma.faultCode.updateMany({
      where: { id: { in: successIds } },
      data: { isIndexed: true },
    });
    console.log(`\n✅ Marked ${successIds.length} codes as indexed.`);
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.log(`⚠️  ${failed} URLs failed.`);
  }

  // Also ping sitemap
  try {
    const sitemapUrl = `${BASE_URL}/sitemap.xml`;
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    console.log("📡 Sitemap ping sent to Google & Bing.");
  } catch {}
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
