import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const ENRICH_PROMPT = `You are given a list of industrial fault codes that already exist in our database. Each entry has a numeric "ref" identifier. Your job is to ENRICH each one with additional structured data.

CRITICAL: You MUST return the "ref" number EXACTLY as provided for each entry. This is how we match your output back to our database. Do NOT omit, rename, or change the ref values.

For each fault code provided, return:
- "ref": The numeric reference ID (MUST match the input ref exactly — this is mandatory)
- "causes": Array of 3-5 strings explaining WHY this fault typically occurs. Be specific to industrial automation equipment. Include parameter numbers where relevant (e.g. "Parameter P1-54 set below motor rated torque"). Examples: "Motor cable insulation breakdown due to aging or mechanical damage", "Supply voltage sag below 340V during heavy load transients", "Encoder feedback cable shielding fault causing signal noise".
- "fixSteps": Array of 3-6 detailed, numbered repair steps. Every step MUST reference a specific measurement, parameter, terminal, or verifiable action. BANNED: "check wiring", "consult manual", "replace if necessary", "ensure proper ventilation".

TEXT FORMATTING RULES (apply to ALL string fields):
1. Parameters: Write as a single unbroken token — "P1-54" NOT "P1 -54" or "P1- 54". No spaces between prefix, hyphen, and number.
2. Parentheses: Every opening ( MUST have a closing ). Never leave dangling parentheses. Use parentheses ONLY for short technical references like "(Brake torque)" or "(24VDC)". Do NOT wrap entire sentences in parentheses.
3. No double spaces. No leading/trailing whitespace in array items.
4. Do NOT use markdown bold (**) in any field — we handle formatting in the UI.

If you cannot produce specific causes/tools for a code, return shorter arrays rather than padding with generic content.

Return ONLY valid JSON. No markdown fences, no commentary.
Output: { "codes": [{ "ref": 1, "causes": ["..."], "fixSteps": ["..."] }] }`;

const BATCH_SIZE = 15;
const RATE_GAP_MS = 35_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type EnrichInput = { ref: number; code: string; title: string; description: string };
type EnrichOutput = { ref: number; causes: string[]; fixSteps: string[] };

async function callGemini(
  codesContext: EnrichInput[],
  maxRetries = 3
): Promise<EnrichOutput[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const codeList = codesContext
    .map((c) => `- ref=${c.ref}: Code "${c.code}", Title "${c.title}" — ${c.description.substring(0, 200)}`)
    .join("\n");

  const prompt = `${ENRICH_PROMPT}\n\nFault codes to enrich:\n${codeList}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      return (parsed.codes || []).map((c: Record<string, unknown>) => ({
        ref: Number(c.ref),
        causes: c.causes || [],
        fixSteps: c.fixSteps || [],
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("429") || msg.includes("503") ||
        msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") || msg.includes("overloaded");

      if (retryable && attempt < maxRetries) {
        const wait = 30 * (attempt + 1);
        console.log(`  ⏳ ${msg.substring(0, 60)}... retrying in ${wait}s (${attempt + 1}/${maxRetries})`);
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const brandFilter = args.find((a) => a.startsWith("--brand="))?.split("=")[1];
  const manualFilter = args.find((a) => a.startsWith("--manual="))?.split("=")[1];
  const dryRun = args.includes("--dry");
  const force = args.includes("--force");

  console.log("🔧 ErrorLib Enrichment Script");
  if (force) console.log("⚡ FORCE MODE: re-processing all matching codes");
  console.log("━".repeat(50));

  const where: Record<string, unknown> = {};

  if (!force) {
    where.OR = [
      { causes: { equals: [] } },
      { causes: { isEmpty: true } },
    ];
  }

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

  if (manualFilter) {
    where.manual = {
      ...(where.manual as object || {}),
      slug: { contains: manualFilter, mode: "insensitive" },
    };
  }

  const unenriched = await prisma.faultCode.findMany({
    where,
    include: { manual: { include: { brand: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📊 Found ${unenriched.length} fault codes needing enrichment`);
  if (unenriched.length === 0) {
    console.log("✅ All codes are already enriched!");
    return;
  }

  const manualGroups = new Map<string, typeof unenriched>();
  for (const fc of unenriched) {
    const key = fc.manualId;
    if (!manualGroups.has(key)) manualGroups.set(key, []);
    manualGroups.get(key)!.push(fc);
  }

  console.log(`📦 Spread across ${manualGroups.size} manuals\n`);

  let totalEnriched = 0;
  let totalFailed = 0;
  let manualIdx = 0;

  for (const [manualId, codes] of manualGroups) {
    manualIdx++;
    const manual = codes[0].manual;
    const label = `${manual.brand.name} / ${manual.name}`;
    console.log(`\n[${manualIdx}/${manualGroups.size}] 📖 ${label} (${codes.length} codes)`);

    for (let batchStart = 0; batchStart < codes.length; batchStart += BATCH_SIZE) {
      const batch = codes.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(codes.length / BATCH_SIZE);

      if (batchStart > 0) {
        console.log(`  ⏳ Rate-limit gap (${RATE_GAP_MS / 1000}s)...`);
        await sleep(RATE_GAP_MS);
      }

      console.log(`  Batch ${batchNum}/${totalBatches}: enriching ${batch.length} codes...`);

      try {
        const enriched = await callGemini(
          batch.map((fc, i) => ({
            ref: batchStart + i,
            code: fc.code,
            title: fc.title,
            description: fc.description,
          }))
        );

        const enrichMap = new Map(enriched.map((e) => [e.ref, e]));

        for (let i = 0; i < batch.length; i++) {
          const fc = batch[i];
          const ref = batchStart + i;
          const data = enrichMap.get(ref);
          if (!data) {
            totalFailed++;
            continue;
          }

          if (dryRun) {
            console.log(`    [DRY] ${fc.code}: ${data.causes?.length || 0} causes, ${data.fixSteps?.length || 0} steps`);
            totalEnriched++;
            continue;
          }

          try {
            const update: Record<string, unknown> = {};
            if (data.causes?.length > 0) update.causes = data.causes;
            if (data.fixSteps?.length > 0) update.fixSteps = data.fixSteps;
            if (Object.keys(update).length > 0) {
              update.translations = {};
              await prisma.faultCode.update({
                where: { id: fc.id },
                data: update,
              });
              totalEnriched++;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`    ❌ ${fc.code}: ${msg.substring(0, 80)}`);
            totalFailed++;
          }
        }

        console.log(`  ✅ Batch ${batchNum} done — Enriched: ${totalEnriched}, Failed: ${totalFailed}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ Batch ${batchNum} failed: ${msg.substring(0, 120)}`);
        totalFailed += batch.length;
      }
    }

    console.log(`  📊 Progress: ${totalEnriched} enriched / ${totalFailed} failed / ${unenriched.length} total`);
  }

  console.log("\n" + "━".repeat(50));
  console.log(`🏁 ENRICHMENT COMPLETE`);
  console.log(`   Successfully enriched: ${totalEnriched}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Total processed: ${unenriched.length}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
