/**
 * Lists brands and manuals from the database.
 *
 * Default: tree matching the brand page (series sub-categories + 80 % name merge).
 *   npx tsx scripts/list-modules.ts
 *
 * Flat list only (legacy):
 *   npx tsx scripts/list-modules.ts --flat
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { groupManualsAsOnSite } from "../src/lib/brand-series-grouping.ts";
import { displayTitleForSeries } from "../src/lib/series-display.ts";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const flatOnly = process.argv.includes("--flat");

function printFlatTree(brands: Awaited<ReturnType<typeof prisma.brand.findMany>>) {
  let grandManuals = 0;
  let grandCodes = 0;

  for (const b of brands) {
    const manualsWithCodes = b.manuals.filter(
      (m) => !m.isBroken && m._count.faultCodes > 0
    );
    const total = manualsWithCodes.reduce((s, m) => s + m._count.faultCodes, 0);
    if (total === 0) continue;

    grandManuals += manualsWithCodes.length;
    grandCodes += total;

    console.log(`\n## ${b.name} (${manualsWithCodes.length} manualer, ${total} feilkoder)`);
    for (const m of manualsWithCodes) {
      console.log(`  - ${m.name} (${m._count.faultCodes})`);
    }
  }

  const withContent = brands.filter((b) =>
    b.manuals.some((m) => !m.isBroken && m._count.faultCodes > 0)
  ).length;
  console.log(
    `\n---\nTotalt: ${withContent} merker med innhold, ${grandManuals} manualer, ${grandCodes} feilkoder`
  );
}

function printSeriesTree(
  brands: Awaited<ReturnType<typeof prisma.brand.findMany>>,
  overrideByBrandId: Map<string, Map<string, string>>
) {
  console.log(
    "=== Merker og underkategorier (kun aktive manualer; serie-merge + DB displayName) ===\n"
  );

  let grandGroups = 0;
  let grandManuals = 0;
  let grandCodes = 0;
  let brandsWithContent = 0;

  for (const b of brands) {
    const manualsWithCodes = b.manuals.filter(
      (m) => !m.isBroken && m._count.faultCodes > 0
    );
    if (manualsWithCodes.length === 0) continue;

    brandsWithContent++;
    const groups = groupManualsAsOnSite(manualsWithCodes, b.name);
    grandGroups += groups.length;
    grandManuals += manualsWithCodes.length;
    grandCodes += manualsWithCodes.reduce((s, m) => s + m._count.faultCodes, 0);

    console.log(`\n## ${b.name}`);
    console.log(`   slug: ${b.slug}  |  ${manualsWithCodes.length} manual(er) → ${groups.length} serie-rute(r) på forsiden av merket`);

    const ov = overrideByBrandId.get(b.id) ?? new Map<string, string>();
    for (const g of groups) {
      const shown = displayTitleForSeries(g.series, ov);
      console.log(
        `\n   [${shown}]  —  ${g.manuals.length} manual(er), ${g.totalCodes} feilkoder`
      );
      for (const { manual, label } of g.manuals) {
        console.log(
          `      • ${manual.name}`
        );
        console.log(
          `        tag: "${label}"  |  ${manual._count.faultCodes} koder  |  slug: ${manual.slug}`
        );
      }
    }
  }

  console.log(
    `\n---\nOppsummert: ${brandsWithContent} merker, ${grandGroups} serie-grupper (etter merge), ${grandManuals} manualer, ${grandCodes} feilkoder`
  );
  console.log(
    "\n(Tips: kjør med --flat for kun flat liste uten serie-gruppering.)"
  );
}

async function main() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      manuals: {
        orderBy: { name: "asc" },
        include: { _count: { select: { faultCodes: true } } },
      },
    },
  });

  const allOverrides = await prisma.seriesGroup.findMany({
    select: { brandId: true, seriesKey: true, displayName: true },
  });
  const overrideByBrandId = new Map<string, Map<string, string>>();
  for (const o of allOverrides) {
    const d = o.displayName?.trim();
    if (!d) continue;
    if (!overrideByBrandId.has(o.brandId)) {
      overrideByBrandId.set(o.brandId, new Map());
    }
    overrideByBrandId.get(o.brandId)!.set(o.seriesKey, d);
  }

  if (flatOnly) {
    printFlatTree(brands);
  } else {
    printSeriesTree(brands, overrideByBrandId);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
