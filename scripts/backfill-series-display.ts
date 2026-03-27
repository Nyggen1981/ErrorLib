/**
 * 1) DB: for SeriesGroup rows where seriesKey still benefits from cleanSeriesTitle
 *    and displayName is empty, set displayName (keeps seriesKey stable for ?series= URLs).
 * 2) Live groups: if any computed series still has consecutive duplicate words, upsert
 *    a displayName fix (does not overwrite non-empty displayName).
 *
 *   npx tsx scripts/backfill-series-display.ts
 *   npx tsx scripts/backfill-series-display.ts --execute
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { groupManualsAsOnSite } from "../src/lib/brand-series-grouping.ts";
import {
  cleanSeriesTitle,
  deduplicateAdjacentWords,
  deduplicateTerms,
} from "../src/lib/manual-title-wash.ts";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const execute = process.argv.includes("--execute");

function hasConsecutiveDuplicateWords(s: string): boolean {
  return /\b(\w+)\s+\1\b/i.test(s.trim());
}

async function main() {
  let would = 0;

  const existing = await prisma.seriesGroup.findMany();
  for (const row of existing) {
    const fixed = cleanSeriesTitle(row.seriesKey);
    const hasManual =
      row.displayName != null && row.displayName.trim() !== "";
    if (hasManual || fixed === row.seriesKey) continue;
    would++;
    console.log(
      `[DB] brandId=${row.brandId} key="${row.seriesKey}" → display "${fixed}"`
    );
    if (execute) {
      await prisma.seriesGroup.update({
        where: { id: row.id },
        data: { displayName: fixed },
      });
    }
  }

  const brands = await prisma.brand.findMany({
    include: {
      manuals: {
        include: { _count: { select: { faultCodes: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const brand of brands) {
    const manuals = brand.manuals.filter((m) => m._count.faultCodes > 0);
    if (manuals.length === 0) continue;

    const groups = groupManualsAsOnSite(manuals, brand.name);

    for (const g of groups) {
      if (!hasConsecutiveDuplicateWords(g.series)) continue;

      const cleaned = deduplicateTerms(deduplicateAdjacentWords(g.series));
      if (cleaned === g.series) continue;

      const row = await prisma.seriesGroup.findUnique({
        where: {
          brandId_seriesKey: { brandId: brand.id, seriesKey: g.series },
        },
      });
      if (row?.displayName != null && row.displayName.trim() !== "") continue;

      would++;
      console.log(
        `[${brand.name}] live "${g.series}" → "${cleaned}" (${g.manuals.length} manuals)`
      );

      if (execute) {
        await prisma.seriesGroup.upsert({
          where: {
            brandId_seriesKey: { brandId: brand.id, seriesKey: g.series },
          },
          create: {
            brandId: brand.id,
            seriesKey: g.series,
            displayName: cleaned,
          },
          update: { displayName: cleaned },
        });
      }
    }
  }

  if (!execute) {
    console.log(`\nDry-run: ${would} update(s)/upsert(s). Pass --execute to apply.`);
  } else {
    console.log(`\nDone. Applied ${would} change(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
