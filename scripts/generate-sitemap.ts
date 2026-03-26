import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { writeFileSync } from "fs";
import { resolve } from "path";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE = "https://errorlib.net";

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

  const urls: string[] = [];

  // Static pages
  urls.push(entry(BASE, new Date(), 1.0, "daily"));
  urls.push(entry(`${BASE}/about`, null, 0.4, "monthly"));
  urls.push(entry(`${BASE}/privacy`, null, 0.2, "yearly"));
  urls.push(entry(`${BASE}/terms`, null, 0.2, "yearly"));

  let brandCount = 0;
  let manualCount = 0;
  let faultCount = 0;

  for (const brand of brands) {
    urls.push(entry(`${BASE}/${brand.slug}`, brand.updatedAt, 0.8, "weekly"));
    brandCount++;

    for (const manual of brand.manuals) {
      if (manual.faultCodes.length === 0) continue;

      urls.push(entry(`${BASE}/${brand.slug}/${manual.slug}`, manual.updatedAt, 0.7, "weekly"));
      manualCount++;

      for (const fc of manual.faultCodes) {
        urls.push(entry(`${BASE}/${brand.slug}/${manual.slug}/${fc.slug}`, fc.updatedAt, 0.6, "monthly"));
        faultCount++;
      }
    }
  }

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");

  const outPath = resolve(process.cwd(), "public", "sitemap.xml");
  writeFileSync(outPath, xml, "utf-8");

  console.log(`\nSitemap generated: ${outPath}`);
  console.log(`  Brands:      ${brandCount}`);
  console.log(`  Manuals:     ${manualCount}`);
  console.log(`  Fault codes: ${faultCount}`);
  console.log(`  Total URLs:  ${urls.length}`);

  await (prisma as any).$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
