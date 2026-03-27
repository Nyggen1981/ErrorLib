import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function sanitize(text: string): string {
  let s = text;

  // Strip markdown bold markers
  s = s.replace(/\*\*/g, "");

  // Fix parameter spacing: "P1 -54" or "P1- 54" → "P1-54"
  // Covers prefixes like P, Par, Pr, F, E, A, r, d, b, n, t followed by digits
  s = s.replace(/\b([PpFfEeAaBbDdNnTtRr](?:ar|r)?\d+)\s*[-–]\s*(\d+)/g, "$1-$2");

  // Fix double spaces
  s = s.replace(/  +/g, " ");

  // Fix dangling open parenthesis at end of string
  s = s.replace(/\s*\(\s*$/, "");

  // Fix unmatched parentheses: remove lone ( with no closing )
  s = fixUnmatchedParens(s);

  return s.trim();
}

function fixUnmatchedParens(text: string): string {
  let depth = 0;
  const removeIndices = new Set<number>();

  // Forward pass: find unmatched )
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "(") depth++;
    else if (chars[i] === ")") {
      if (depth > 0) depth--;
      else removeIndices.add(i);
    }
  }

  // Backward pass: find unmatched (
  depth = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === ")") depth++;
    else if (chars[i] === "(") {
      if (depth > 0) depth--;
      else removeIndices.add(i);
    }
  }

  if (removeIndices.size === 0) return text;
  return chars.filter((_, i) => !removeIndices.has(i)).join("");
}

function sanitizeArray(arr: string[]): string[] {
  return arr.map(sanitize).filter((s) => s.length > 0);
}

async function main() {
  const args = process.argv.slice(2);
  const brandFilter = args.find((a) => a.startsWith("--brand="))?.split("=")[1];
  const dryRun = args.includes("--dry");

  console.log("🧹 ErrorLib Text Cleanup Script");
  if (dryRun) console.log("👀 DRY RUN — no DB writes");
  console.log("━".repeat(50));

  const where: Record<string, unknown> = {};

  if (brandFilter) {
    const brand = await prisma.brand.findFirst({
      where: { slug: { contains: brandFilter, mode: "insensitive" } },
    });
    if (!brand) {
      console.error(`❌ Brand "${brandFilter}" not found`);
      process.exit(1);
    }
    console.log(`📌 Filtering to brand: ${brand.name}`);
    where.manual = { brandId: brand.id };
  }

  const codes = await prisma.faultCode.findMany({
    where,
    include: { manual: { include: { brand: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📊 Found ${codes.length} fault codes to scan\n`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const fc of codes) {
    const newDesc = sanitize(fc.description);
    const newCauses = sanitizeArray(fc.causes);
    const newSteps = sanitizeArray(fc.fixSteps);
    const newTitle = sanitize(fc.title);

    const changed =
      newDesc !== fc.description ||
      newTitle !== fc.title ||
      JSON.stringify(newCauses) !== JSON.stringify(fc.causes) ||
      JSON.stringify(newSteps) !== JSON.stringify(fc.fixSteps);

    if (!changed) {
      unchanged++;
      continue;
    }

    if (dryRun) {
      console.log(`  [FIX] ${fc.manual.brand.name} / ${fc.code}`);
      if (newDesc !== fc.description)
        console.log(`    desc: "${fc.description.substring(0, 60)}..." → "${newDesc.substring(0, 60)}..."`);
      if (newTitle !== fc.title)
        console.log(`    title: "${fc.title}" → "${newTitle}"`);
      if (JSON.stringify(newCauses) !== JSON.stringify(fc.causes))
        console.log(`    causes: ${fc.causes.length} items cleaned`);
      if (JSON.stringify(newSteps) !== JSON.stringify(fc.fixSteps))
        console.log(`    steps: ${fc.fixSteps.length} items cleaned`);
      updated++;
      continue;
    }

    try {
      await prisma.faultCode.update({
        where: { id: fc.id },
        data: {
          title: newTitle,
          description: newDesc,
          causes: newCauses,
          fixSteps: newSteps,
          translations: {},
        },
      });
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${fc.code}: ${msg.substring(0, 80)}`);
      errors++;
    }
  }

  console.log("\n" + "━".repeat(50));
  console.log(`🏁 CLEANUP COMPLETE`);
  console.log(`   Fixed: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total scanned: ${codes.length}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
