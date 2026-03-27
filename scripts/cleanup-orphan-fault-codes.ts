/**
 * Find FaultCode rows with no valid Manual row, null manualId, or Manual without Brand.
 *
 *   npx tsx scripts/cleanup-orphan-fault-codes.ts        # dry-run
 *   npx tsx scripts/cleanup-orphan-fault-codes.ts --execute
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const execute = process.argv.includes("--execute");

async function orphanIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT fc.id
    FROM "FaultCode" fc
    LEFT JOIN "Manual" m ON m.id = fc."manualId"
    LEFT JOIN "Brand" b ON b.id = m."brandId"
    WHERE fc."manualId" IS NULL OR m.id IS NULL OR b.id IS NULL
  `;
  return rows.map((r) => r.id);
}

async function main() {
  const ids = await orphanIds();
  console.log(`Orphaned fault codes: ${ids.length}`);
  if (ids.length && ids.length <= 30) {
    console.log(ids.join("\n"));
  } else if (ids.length > 30) {
    console.log("(first 20)", ids.slice(0, 20).join(", "), "…");
  }

  if (!execute) {
    console.log("\nDry-run. Pass --execute to delete these rows.");
    return;
  }

  if (ids.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const res = await prisma.faultCode.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${res.count} fault code(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
