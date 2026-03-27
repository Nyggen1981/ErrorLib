/**
 * Eksporter alle feilkoder med merke, serie (kategori) og manual til .txt
 *
 *   npx tsx scripts/export-catalog.ts
 *   npx tsx scripts/export-catalog.ts "C:\sti\katalog.txt"
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { extractSeries } from "../src/lib/brand-series-grouping.ts";
import { displayTitleForSeries } from "../src/lib/series-display.ts";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const outPath = resolve(
  process.argv[2] ?? "fault-katalog.txt"
);

async function main() {
  const [codes, seriesRows, brandCount, manualCount, faultCodeCount] =
    await Promise.all([
      prisma.faultCode.findMany({
        orderBy: [
          { manual: { brand: { name: "asc" } } },
          { manual: { name: "asc" } },
          { code: "asc" },
        ],
        include: {
          manual: { include: { brand: true } },
        },
      }),
      prisma.seriesGroup.findMany({
        select: { brandId: true, seriesKey: true, displayName: true },
      }),
      prisma.brand.count(),
      prisma.manual.count(),
      prisma.faultCode.count(),
    ]);

  if (codes.length !== faultCodeCount) {
    console.warn(
      `ADVARSEL: findMany returnerte ${codes.length} rader, men faultCode.count() = ${faultCodeCount}. Sjekk DATABASE_URL / driver.`
    );
  }

  const overrideByBrand = new Map<string, Map<string, string>>();
  for (const r of seriesRows) {
    const d = r.displayName?.trim();
    if (!d) continue;
    if (!overrideByBrand.has(r.brandId)) {
      overrideByBrand.set(r.brandId, new Map());
    }
    overrideByBrand.get(r.brandId)!.set(r.seriesKey, d);
  }

  const lines: string[] = [];
  const stamp = new Date().toISOString();
  lines.push("ErrorLib — katalog (merker, kategorier/serier, feilkoder)");
  lines.push(`Generert (UTC): ${stamp}`);
  lines.push(
    `Feilkoder i DB (count): ${faultCodeCount}  —  rader i denne eksporten: ${codes.length}`
  );
  lines.push(
    `Merker: ${brandCount}  ·  Manualer: ${manualCount}`
  );
  if (codes.length !== faultCodeCount) {
    lines.push(
      `!!! AVVIK: Eksporten inneholder ikke alle rader. Bruk samme DATABASE_URL som nettsiden (Vercel env).`
    );
  }
  lines.push("".padEnd(80, "="));
  lines.push("");

  let curBrand = "";
  let curCategory = "";
  let curManualId = "";

  for (const fc of codes) {
    const b = fc.manual.brand;
    const m = fc.manual;
    const seriesKey = extractSeries(m.name, b.name);
    const category = displayTitleForSeries(
      seriesKey,
      overrideByBrand.get(b.id) ?? new Map()
    );

    if (b.name !== curBrand) {
      curBrand = b.name;
      lines.push("");
      lines.push(`MERKE: ${b.name}`);
      lines.push(`slug: ${b.slug}`);
      lines.push("-".repeat(72));
      curCategory = "";
      curManualId = "";
    }

    if (category !== curCategory) {
      curCategory = category;
      lines.push("");
      lines.push(`  KATEGORI / SERIE: ${category}`);
      if (category !== seriesKey) {
        lines.push(`  (serieKey: ${seriesKey})`);
      }
      curManualId = "";
    }

    if (m.id !== curManualId) {
      curManualId = m.id;
      const broken = m.isBroken ? "  [PDF brutt]" : "";
      lines.push("");
      lines.push(`    Manual: ${m.name}${broken}`);
      lines.push(`    slug: ${m.slug}`);
    }

    const titleOneLine = fc.title.replace(/\s+/g, " ").trim();
    lines.push(`      ${fc.code}\t${titleOneLine}`);
  }

  lines.push("");
  lines.push("".padEnd(80, "="));
  lines.push("TAB-separert (merke | kategori | manual | kode | tittel)");
  lines.push("");

  for (const fc of codes) {
    const b = fc.manual.brand;
    const m = fc.manual;
    const seriesKey = extractSeries(m.name, b.name);
    const category = displayTitleForSeries(
      seriesKey,
      overrideByBrand.get(b.id) ?? new Map()
    );
    const titleOneLine = fc.title.replace(/\s+/g, " ").trim();
    const row = [b.name, category, m.name, fc.code, titleOneLine]
      .map((cell) => String(cell).replace(/\t/g, " ").replace(/\r?\n/g, " "))
      .join("\t");
    lines.push(row);
  }

  const body = lines.join("\r\n");
  writeFileSync(outPath, `\uFEFF${body}`, "utf8");
  console.log(
    `Skrev ${codes.length} koder (DB count: ${faultCodeCount}) til:\n${outPath}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
