import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE = "https://errorlib.net";
const CHUNK_SIZE = 1000;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function entry(loc: string, lastmod: Date | null, priority: number, changefreq: string) {
  const parts = [
    `  <url>`,
    `    <loc>${esc(loc)}</loc>`,
  ];
  if (lastmod) parts.push(`    <lastmod>${lastmod.toISOString().split("T")[0]}</lastmod>`);
  parts.push(`    <changefreq>${changefreq}</changefreq>`);
  parts.push(`    <priority>${priority.toFixed(1)}</priority>`);
  parts.push(`  </url>`);
  return parts.join("\n");
}

async function main() {
  console.log("Fetching data from database...");

  const brands = await prisma.brand.findMany({
    include: {
      manuals: {
        include: {
          faultCodes: { select: { slug: true, updatedAt: true } },
        },
      },
    },
  });

  const staticAndStructureUrls: string[] = [];
  const faultUrls: string[] = [];

  // Static pages
  staticAndStructureUrls.push(entry(BASE, new Date(), 1.0, "daily"));
  staticAndStructureUrls.push(entry(`${BASE}/about`, null, 0.4, "monthly"));
  staticAndStructureUrls.push(entry(`${BASE}/privacy`, null, 0.2, "yearly"));
  staticAndStructureUrls.push(entry(`${BASE}/terms`, null, 0.2, "yearly"));

  let brandCount = 0;
  let manualCount = 0;
  let faultCount = 0;

  for (const brand of brands) {
    staticAndStructureUrls.push(entry(`${BASE}/${brand.slug}`, brand.updatedAt, 0.8, "weekly"));
    brandCount++;

    for (const manual of brand.manuals) {
      if (manual.faultCodes.length === 0) continue;

      staticAndStructureUrls.push(
        entry(`${BASE}/${brand.slug}/${manual.slug}`, manual.updatedAt, 0.7, "weekly")
      );
      manualCount++;

      for (const fc of manual.faultCodes) {
        faultUrls.push(
          entry(`${BASE}/${brand.slug}/${manual.slug}/${fc.slug}`, fc.updatedAt, 0.6, "monthly")
        );
        faultCount++;
      }
    }
  }

  const publicDir = resolve(process.cwd(), "public");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

  for (const file of readdirSync(publicDir)) {
    if (file === "sitemap.xml" || /^sitemap-\d+\.xml$/.test(file)) {
      rmSync(resolve(publicDir, file), { force: true });
    }
  }

  const chunks: string[][] = [staticAndStructureUrls];
  for (let i = 0; i < faultUrls.length; i += CHUNK_SIZE) {
    chunks.push(faultUrls.slice(i, i + CHUNK_SIZE));
  }

  chunks.forEach((chunkEntries, idx) => {
    const chunkXml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...chunkEntries,
      `</urlset>`,
    ].join("\n");

    const chunkPath = resolve(publicDir, `sitemap-${idx}.xml`);
    writeFileSync(chunkPath, chunkXml, "utf-8");
  });

  const indexXml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...chunks.map((_, idx) => `  <sitemap><loc>${BASE}/sitemap-${idx}.xml</loc></sitemap>`),
    `</sitemapindex>`,
  ].join("\n");

  const outPath = resolve(publicDir, "sitemap.xml");
  writeFileSync(outPath, indexXml, "utf-8");

  console.log(`\nSitemap index generated: ${outPath}`);
  console.log(`  Chunk size:  ${CHUNK_SIZE}`);
  console.log(`  Chunk files: ${chunks.length} (sitemap-0.xml ... sitemap-${chunks.length - 1}.xml)`);
  console.log(`  Brands:      ${brandCount}`);
  console.log(`  Manuals:     ${manualCount}`);
  console.log(`  Fault codes: ${faultCount}`);
  console.log(`  Total URLs:  ${staticAndStructureUrls.length + faultUrls.length}`);

  await (prisma as any).$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
