/**
 * Remove " AC Drive(s)" from Manual.name across the database (series extraction + display).
 *
 *   npx tsx scripts/strip-ac-drives-manual-names.ts
 *   npx tsx scripts/strip-ac-drives-manual-names.ts --execute
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  normalizePowerFlexCompound,
  stripAcDrivesPhrase,
} from "../src/lib/manual-title-wash.ts";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const execute = process.argv.includes("--execute");

async function main() {
  const manuals = await prisma.manual.findMany({ select: { id: true, name: true } });
  let n = 0;
  for (const m of manuals) {
    const next = normalizePowerFlexCompound(stripAcDrivesPhrase(m.name));
    if (next === m.name) continue;
    n++;
    console.log(`"${m.name}" → "${next}"`);
    if (execute) {
      await prisma.manual.update({
        where: { id: m.id },
        data: { name: next },
      });
    }
  }
  if (!execute) {
    console.log(`\nDry-run: ${n} manual(s). Pass --execute to apply.`);
  } else {
    console.log(`\nUpdated ${n} manual(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
