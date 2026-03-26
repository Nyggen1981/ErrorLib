import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { GoogleGenerativeAI } from "@google/generative-ai";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ManualEntry = {
  id: string;
  name: string;
  slug: string;
  codes: number;
};

async function findDuplicateGroups(
  brandName: string,
  manuals: ManualEntry[]
): Promise<{ canonical: string; members: ManualEntry[] }[]> {
  if (manuals.length <= 1) return [];

  const nameList = manuals.map((m) => `  - "${m.name}" (${m.codes} codes)`).join("\n");

  const prompt = `You are an industrial equipment database administrator. We want ONE entry per physical product family. Analyze these manual entries for "${brandName}" and group manuals that cover the SAME product, even if they are different document types.

MANUALS:
${nameList}

RULES:
1. MERGE manuals for the SAME product regardless of document-type suffixes. Treat these suffixes as irrelevant when comparing product identity:
   "Programming", "Maintenance", "Troubleshooting", "Technical Manual", "Instruction Manual", "User Manual", "Installation", "Quick Start", "Reference", "Parameter", "Hardware", "Firmware", "Software", "Application", "Guide", "Configuration".
   Example: "F7 Drive" and "F7 Drive Programming" → MERGE into "F7 Drive".
   Example: "GA500 Maintenance and Troubleshooting" and "GA500 AC Drive" → MERGE into "GA500 AC Drive".
2. NEVER merge DIFFERENT model numbers: "PowerFlex 4" and "PowerFlex 40", "ACS880-31" and "ACS880-07", "FR-D700" and "FR-E500" are all DIFFERENT products.
3. NEVER merge a parent series with a different sub-model: "R-30iA/R-30iB" and "R-30iB Mate" are DIFFERENT controllers.
4. DO merge formatting/spelling variants: "Series 30i" vs "30i Series", "αi series" vs "αi Series".
5. For the canonical name: use the shortest, cleanest product name WITHOUT document-type suffixes. Include the brand prefix.
   Good: "${brandName} F7 Drive", "${brandName} GA500 AC Drive"
   Bad: "${brandName} F7 Drive Programming", "${brandName} GA500 Maintenance and Troubleshooting"

Return valid JSON array: [{ "canonical": "Best Name", "members": ["exact name 1", "exact name 2"] }]
If no groups found, return: []
Return ONLY the JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const groups = JSON.parse(cleaned) as {
      canonical: string;
      members: string[];
    }[];

    // Map string names back to ManualEntry objects
    const nameMap = new Map(manuals.map((m) => [m.name, m]));
    return groups
      .map((g) => ({
        canonical: g.canonical,
        members: g.members
          .map((name) => nameMap.get(name))
          .filter((m): m is ManualEntry => !!m),
      }))
      .filter((g) => g.members.length >= 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("quota")) {
      console.log("  [RATE LIMIT] Waiting 60s...");
      await sleep(60_000);
      return findDuplicateGroups(brandName, manuals);
    }
    console.error(`  [ERROR] Gemini: ${msg.substring(0, 150)}`);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const brandFilter = args
    .find((a) => a.startsWith("--brand="))
    ?.split("=")[1]
    ?.toLowerCase();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  MODEL DEDUPLICATION${dry ? " (DRY RUN)" : ""}`);
  console.log(`${"═".repeat(60)}\n`);

  const brands = await prisma.brand.findMany({
    include: {
      manuals: {
        select: { id: true, name: true, slug: true, _count: { select: { faultCodes: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const brand of brands) {
    if (brandFilter && brand.name.toLowerCase() !== brandFilter) continue;
    if (brand.manuals.length <= 1) continue;

    const entries: ManualEntry[] = brand.manuals.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      codes: m._count.faultCodes,
    }));

    console.log(`\n── ${brand.name} (${entries.length} manuals) ──`);

    const groups = await findDuplicateGroups(brand.name, entries);

    if (groups.length === 0) {
      console.log("  ✅ No duplicates found");
      continue;
    }

    for (const group of groups) {
      console.log(`\n  📦 Group: "${group.canonical}"`);

      // Pick the keeper: prefer the one with most fault codes, then longest name
      const sorted = [...group.members].sort(
        (a, b) => b.codes - a.codes || b.name.length - a.name.length
      );
      const keeper = sorted[0];
      const others = sorted.slice(1);

      // Determine if keeper needs renaming
      const needsRename = keeper.name !== group.canonical;
      const newSlug = slugify(group.canonical);

      console.log(`    Keeper: "${keeper.name}" (${keeper.codes} codes)`);
      for (const other of others) {
        console.log(`    Merge:  "${other.name}" (${other.codes} codes)`);
      }

      if (!dry) {
        // Move fault codes from others → keeper
        for (const other of others) {
          if (other.codes > 0) {
            // Move codes, skip duplicates (same code string in same manual)
            const otherCodes = await prisma.faultCode.findMany({
              where: { manualId: other.id },
              select: { id: true, code: true },
            });
            const keeperCodes = await prisma.faultCode.findMany({
              where: { manualId: keeper.id },
              select: { code: true },
            });
            const keeperCodeSet = new Set(keeperCodes.map((c) => c.code));

            const toMove = otherCodes.filter((c) => !keeperCodeSet.has(c.code));
            const toDrop = otherCodes.filter((c) => keeperCodeSet.has(c.code));

            if (toMove.length > 0) {
              await prisma.faultCode.updateMany({
                where: { id: { in: toMove.map((c) => c.id) } },
                data: { manualId: keeper.id },
              });
              console.log(`    ↪ Moved ${toMove.length} codes from "${other.name}"`);
            }
            if (toDrop.length > 0) {
              await prisma.faultCode.deleteMany({
                where: { id: { in: toDrop.map((c) => c.id) } },
              });
              console.log(`    🗑️  Dropped ${toDrop.length} duplicate codes from "${other.name}"`);
            }
          }

          // Delete the empty manual
          await prisma.manual.delete({ where: { id: other.id } });
          console.log(`    🗑️  Deleted manual: "${other.name}"`);
          totalDeleted++;
        }

        // Rename keeper if needed
        if (needsRename) {
          const slugConflict = await prisma.manual.findUnique({ where: { slug: newSlug } });
          if (!slugConflict || slugConflict.id === keeper.id) {
            await prisma.manual.update({
              where: { id: keeper.id },
              data: { name: group.canonical, slug: newSlug },
            });
            console.log(`    ✏️  Renamed keeper → "${group.canonical}"`);
          } else {
            console.log(`    ⚠️  Slug conflict, keeping original name`);
          }
        }
      }

      totalMerged += others.length;
    }

    await sleep(3000);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Merge groups processed: ${totalMerged}`);
  console.log(`  Manuals deleted: ${dry ? "(dry run)" : totalDeleted}`);
  console.log(`${"═".repeat(60)}\n`);

  await prisma["$disconnect"]();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
