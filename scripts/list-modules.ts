import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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

  let grandManuals = 0;
  let grandCodes = 0;

  for (const b of brands) {
    const manualsWithCodes = b.manuals.filter((m) => m._count.faultCodes > 0);
    const total = manualsWithCodes.reduce((s, m) => s + m._count.faultCodes, 0);
    if (total === 0) continue;

    grandManuals += manualsWithCodes.length;
    grandCodes += total;

    console.log(`\n## ${b.name} (${manualsWithCodes.length} manualer, ${total} feilkoder)`);
    for (const m of manualsWithCodes) {
      console.log(`  - ${m.name} (${m._count.faultCodes})`);
    }
  }

  console.log(`\n---\nTotalt: ${brands.filter((b) => b.manuals.some((m) => m._count.faultCodes > 0)).length} merker med innhold, ${grandManuals} manualer, ${grandCodes} feilkoder`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
