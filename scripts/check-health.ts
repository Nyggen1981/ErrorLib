import "dotenv/config";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const total = await prisma.faultCode.count();

  // Raw SQL for accurate array length checks
  const causesCheck = await prisma.$queryRaw<{ empty: bigint; nonempty: bigint }[]>(
    Prisma.sql`SELECT 
      COUNT(*) FILTER (WHERE array_length(causes, 1) IS NULL OR array_length(causes, 1) = 0) as empty,
      COUNT(*) FILTER (WHERE array_length(causes, 1) > 0) as nonempty
    FROM "FaultCode"`
  );
  const stepsCheck = await prisma.$queryRaw<{ empty: bigint; nonempty: bigint }[]>(
    Prisma.sql`SELECT 
      COUNT(*) FILTER (WHERE array_length("fixSteps", 1) IS NULL OR array_length("fixSteps", 1) = 0) as empty,
      COUNT(*) FILTER (WHERE array_length("fixSteps", 1) > 0) as nonempty
    FROM "FaultCode"`
  );

  const ce = Number(causesCheck[0].empty);
  const cn = Number(causesCheck[0].nonempty);
  const se = Number(stepsCheck[0].empty);
  const sn = Number(stepsCheck[0].nonempty);

  console.log("=== DATABASE ENRICHMENT HEALTH CHECK (raw SQL) ===");
  console.log(`Total fault codes: ${total}`);
  console.log();
  console.log(`Causes populated:    ${cn} / ${total} (${Math.round(cn / total * 100)}%)`);
  console.log(`Causes EMPTY:        ${ce} / ${total} (${Math.round(ce / total * 100)}%)`);
  console.log();
  console.log(`FixSteps populated:  ${sn} / ${total} (${Math.round(sn / total * 100)}%)`);
  console.log(`FixSteps EMPTY:      ${se} / ${total} (${Math.round(se / total * 100)}%)`);
  console.log();
  console.log(`Fully enriched:      ${Math.min(cn, sn)} / ${total} (${Math.round(Math.min(cn, sn) / total * 100)}%)`);

  if (ce > 0) {
    const samples = await prisma.$queryRaw<{ code: string; brand: string }[]>(
      Prisma.sql`SELECT fc.code, b.name as brand 
        FROM "FaultCode" fc 
        JOIN "Manual" m ON fc."manualId" = m.id 
        JOIN "Brand" b ON m."brandId" = b.id 
        WHERE array_length(fc.causes, 1) IS NULL 
        LIMIT 10`
    );
    console.log(`\nSample codes missing causes:`);
    for (const s of samples) console.log(`  ${s.brand} / ${s.code}`);
  }

  if (se > 0) {
    const samples = await prisma.$queryRaw<{ code: string; brand: string }[]>(
      Prisma.sql`SELECT fc.code, b.name as brand 
        FROM "FaultCode" fc 
        JOIN "Manual" m ON fc."manualId" = m.id 
        JOIN "Brand" b ON m."brandId" = b.id 
        WHERE array_length(fc."fixSteps", 1) IS NULL 
        LIMIT 10`
    );
    console.log(`\nSample codes missing fixSteps:`);
    for (const s of samples) console.log(`  ${s.brand} / ${s.code}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
