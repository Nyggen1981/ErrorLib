import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { GoogleGenerativeAI } from "@google/generative-ai";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const PART_NUMBER_PATTERNS = [
  /^[A-Z]\d{2}[A-Z]-\d{4}/i,         // A20B-2101
  /^\d{1,2}[A-Z]{2}\d{4}/i,           // 6SL3210
  /^[A-Z]\d{2}[A-Z]{2,}[a-z]/i,       // E84AVSCx
  /^[A-Z]{2,3}\d{5,}/i,               // DPD00716
  /^\d{6,}/,                           // pure long number
  /^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,4}/i, // XX-YY-ZZ style part numbers
];

const GENERIC_NAMES = new Set([
  "connection", "guide", "manual", "system", "diagnostics",
  "service bulletin", "parameter list", "maintenance",
  "error codes", "faults", "alarms", "list", "document",
  "manual guide", "installation", "bulletin", "reference",
  "information", "operator", "description",
]);

function isBadName(name: string, brandName: string): boolean {
  const stripped = name
    .replace(new RegExp(`^\\[PDF\\]\\s*`, "i"), "")
    .replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .trim();

  if (stripped.length < 3) return true;

  for (const pattern of PART_NUMBER_PATTERNS) {
    if (pattern.test(stripped)) return true;
  }

  if (GENERIC_NAMES.has(stripped.toLowerCase())) return true;

  const words = stripped.split(/\s+/);
  if (words.length === 1 && /^[A-Z0-9]{8,}$/i.test(words[0])) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function suggestName(
  currentName: string,
  brandName: string,
  pdfUrl: string | null
): Promise<string | null> {
  const prompt = `You are renaming an industrial equipment manual entry in a database.

Current name: "${currentName}"
Brand: ${brandName}
PDF URL: ${pdfUrl ?? "unknown"}

The current name is BAD because it uses a part number, generic word, or document type instead of the actual product model name.

Your task: Identify the REAL product model/series this manual covers, based on the name and URL.

RULES:
1. Return "${brandName}" followed by the actual product model series name.
2. NEVER use part numbers (A20B-xxx, 6SL-xxx, E84AVSCx, DPD00716).
3. NEVER use document types (Manual, Guide, Bulletin, List, Parameter).
4. NEVER use generic terms (System, Connection, Diagnostics).
5. Use the URL path to identify the product if the name is unclear.
6. Add a short product type descriptor (e.g., "CNC Controller", "Servo Amplifier", "Inverter", "Drive").
7. Maximum 60 characters.

Examples:
- "Fanuc A20B-2101-0390" → "Fanuc Series 16/18 Hardware"
- "ABB Connection" → skip (not enough info — return SKIP)
- "Lenze E84AVSCx 8400 StateLine C manual" → "Lenze 8400 StateLine C Drive"
- "Fanuc Manual Guide" → skip (return SKIP)

If you truly cannot determine the model from the name and URL, return exactly: SKIP
Otherwise return ONLY the new name.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/["']/g, "");

    if (text === "SKIP" || text.length < 4 || text.length > 80) {
      return null;
    }

    if (isBadName(text, brandName)) return null;

    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("quota")) {
      console.log("  [RATE LIMIT] Waiting 60s...");
      await sleep(60_000);
      return suggestName(currentName, brandName, pdfUrl);
    }
    console.error(`  [ERROR] Gemini: ${msg.substring(0, 120)}`);
    return null;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const brandFilter = args
    .find((a) => a.startsWith("--brand="))
    ?.split("=")[1]
    ?.toLowerCase();

  console.log(`\n🔍 Scanning for bad manual names...${dry ? " (DRY RUN)" : ""}\n`);

  const manuals = await prisma.manual.findMany({
    include: {
      brand: { select: { name: true } },
      _count: { select: { faultCodes: true } },
    },
  });

  const candidates = manuals.filter((m) => {
    if (brandFilter && m.brand.name.toLowerCase() !== brandFilter) return false;
    return isBadName(m.name, m.brand.name);
  });

  console.log(`Found ${candidates.length} manuals with problematic names (out of ${manuals.length} total)\n`);

  if (candidates.length === 0) {
    console.log("✅ All manual names look good!");
    await prisma.$disconnect();
    return;
  }

  let renamed = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const m = candidates[i];
    console.log(`[${i + 1}/${candidates.length}] ${m.brand.name} / "${m.name}" (${m._count.faultCodes} codes)`);
    console.log(`  URL: ${m.pdfUrl ?? "none"}`);

    const newName = await suggestName(m.name, m.brand.name, m.pdfUrl);

    if (!newName) {
      console.log(`  ⏭️  SKIP (no better name found)\n`);
      skipped++;
      continue;
    }

    console.log(`  ✏️  → "${newName}"`);

    if (!dry) {
      const newSlug = slugify(newName);

      const existing = await prisma.manual.findUnique({
        where: { slug: newSlug },
      });

      if (existing && existing.id !== m.id) {
        console.log(`  ⚠️  Slug conflict with existing manual "${existing.name}" — skipping\n`);
        skipped++;
        continue;
      }

      await prisma.manual.update({
        where: { id: m.id },
        data: { name: newName, slug: newSlug },
      });
      console.log(`  ✅ Updated in DB\n`);
    } else {
      console.log(`  (dry run — no changes)\n`);
    }

    renamed++;

    if (i < candidates.length - 1) {
      await sleep(2000);
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  Renamed: ${renamed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total scanned: ${candidates.length}`);
  console.log(`${"═".repeat(50)}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
