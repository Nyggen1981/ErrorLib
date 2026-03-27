import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { indexingBrandPriorityScore } from "../src/lib/indexing-priority.ts";

const BASE_URL = process.env.SITE_URL || "https://errorlib.net";
/** Daglig mål (Google anbefaler ikke å spamme; feilede URL-er forblir isIndexed=false og prøves igjen). */
const BATCH_SIZE = 200;
const FETCH_POOL = Math.max(BATCH_SIZE * 4, 800);

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
  console.log("🔎 Henter ikke-indekserte feilkoder (prioritet: Bosch/Rexroth, Fanuc, … deretter nyeste)…");

  const pool = await prisma.faultCode.findMany({
    where: { isIndexed: false },
    take: FETCH_POOL,
    select: {
      id: true,
      slug: true,
      updatedAt: true,
      manual: {
        select: {
          slug: true,
          brand: { select: { slug: true } },
        },
      },
    },
  });

  pool.sort((a, b) => {
    const pa = indexingBrandPriorityScore(a.manual.brand.slug);
    const pb = indexingBrandPriorityScore(b.manual.brand.slug);
    if (pa !== pb) return pa - pb;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const codes = pool.slice(0, BATCH_SIZE);

  if (codes.length === 0) {
    console.log("✅ Alle feilkoder er allerede markert som indeksert.");
    return;
  }

  console.log(`📤 Pusher ${codes.length} URL-er (maks ${BATCH_SIZE} per kjøring). Kun vellykkede markeres isIndexed=true — feil prøves neste gang.`);

  const auth = await getAuth();
  const urls = codes.map(
    (fc) => `${BASE_URL}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`
  );

  const results = await pushUrls(urls, auth);

  const successIds = codes
    .filter((_, i) => results[i]?.ok)
    .map((fc) => fc.id);

  if (successIds.length > 0) {
    await prisma.faultCode.updateMany({
      where: { id: { in: successIds } },
      data: { isIndexed: true },
    });
    console.log(`\n✅ Markerte ${successIds.length} koder som indeksert.`);
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.log(`⚠️  ${failed} URL-er feilet — forblir isIndexed=false (ingen «brukt kvote» i DB).`);
  }

  try {
    const sitemapUrl = `${BASE_URL}/sitemap.xml`;
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    console.log("📡 Sitemap ping til Google & Bing.");
  } catch {}
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
