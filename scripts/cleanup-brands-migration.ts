/**
 * One-off brand / manual cleanup (no renames, no arbitrary code deletion).
 *
 * Dry-run (default): logs planned moves/deletes only.
 * Apply: npx tsx scripts/cleanup-brands-migration.ts --execute
 *
 * Mirrors prisma/migrations/*_brand_manual_cleanup/migration.sql for migrate deploy.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const EXECUTE = process.argv.includes("--execute");

function connect() {
  return new PrismaClient({
    adapter: new PrismaNeon({
      connectionString: process.env.DATABASE_URL!,
    }),
  });
}

async function mergeMitsubishi(prisma: PrismaClient) {
  const from = await prisma.brand.findUnique({
    where: { slug: "mitsubishi" },
    include: { _count: { select: { manuals: true } } },
  });
  const to = await prisma.brand.findUnique({ where: { slug: "mitsubishi-electric" } });

  if (!from) {
    console.log("[Mitsubishi] No brand with slug 'mitsubishi' — nothing to merge.");
    return;
  }
  if (!to) {
    console.log(
      "[Mitsubishi] Target brand 'mitsubishi-electric' not found — aborting this step."
    );
    return;
  }

  const n = from._count.manuals;
  console.log(
    `Will move ${n} manual(s) from "${from.name}" (${from.slug}) → "${to.name}" (${to.slug})`
  );

  if (!EXECUTE) return;

  if (n > 0) {
    await prisma.manual.updateMany({
      where: { brandId: from.id },
      data: { brandId: to.id },
    });
    console.log(`  Done: updated ${n} manual row(s).`);
  }

  await prisma.brand.delete({ where: { id: from.id } });
  console.log(`  Deleted brand row slug=mitsubishi`);
}

async function moveAbbAcs800(prisma: PrismaClient) {
  const manual = await prisma.manual.findUnique({
    where: { slug: "abb-acs800-standard-firmware" },
    include: { brand: true },
  });
  const abb = await prisma.brand.findUnique({ where: { slug: "abb" } });

  if (!manual) {
    console.log("[ABB ACS800] Manual slug 'abb-acs800-standard-firmware' not found — skip.");
    return;
  }
  if (!abb) {
    console.log("[ABB ACS800] Brand slug 'abb' not found — skip.");
    return;
  }
  if (manual.brandId === abb.id) {
    console.log(
      `[ABB ACS800] Manual already under ABB — skip.`
    );
    return;
  }

  console.log(
    `Will move 1 manual "${manual.slug}" from "${manual.brand.name}" (${manual.brand.slug}) → "${abb.name}" (${abb.slug})`
  );

  if (!EXECUTE) return;

  await prisma.manual.update({
    where: { id: manual.id },
    data: { brandId: abb.id },
  });
  console.log(`  Done.`);
}

async function deleteConsumerOmron(prisma: PrismaClient) {
  const manual = await prisma.manual.findUnique({
    where: { slug: "omron-bp760n-blood-pressure-monitor" },
    include: { _count: { select: { faultCodes: true } } },
  });

  if (!manual) {
    console.log(
      "[Consumer] Manual 'omron-bp760n-blood-pressure-monitor' not found — skip."
    );
    return;
  }

  const fc = manual._count.faultCodes;
  console.log(
    `Will delete manual "${manual.slug}" and ${fc} fault code row(s) (cascade)`
  );

  if (!EXECUTE) return;

  await prisma.manual.delete({ where: { id: manual.id } });
  console.log(`  Done.`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(
    EXECUTE
      ? "=== EXECUTE MODE (writing to database) ===\n"
      : "=== DRY RUN (no writes). Pass --execute to apply. ===\n"
  );

  const prisma = connect();
  try {
    await mergeMitsubishi(prisma);
    await moveAbbAcs800(prisma);
    await deleteConsumerOmron(prisma);
  } finally {
    await prisma.$disconnect();
  }

  if (!EXECUTE) {
    console.log("\nDry run finished. Re-run with --execute after review.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
