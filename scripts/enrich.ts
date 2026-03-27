import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const FORMATTING_RULES = `TEXT FORMATTING RULES (apply to ALL string fields):
1. Parameters: Write as a single unbroken token — "P1-54" NOT "P1 -54" or "P1- 54".
2. Parentheses: Every ( MUST have a closing ). Use only for short technical references like "(24VDC)".
3. No double spaces. No leading/trailing whitespace.
4. Do NOT use markdown bold (**).`;

function buildPrompt(needsCauses: boolean, needsSteps: boolean): string {
  const fields: string[] = [
    `- "ref": The numeric reference ID (MUST match input exactly)`,
  ];
  if (needsCauses)
    fields.push(
      `- "causes": Array of 3-5 strings explaining WHY this fault occurs. Be specific to industrial equipment. Include parameter numbers where relevant.`
    );
  if (needsSteps)
    fields.push(
      `- "fixSteps": Array of 3-6 detailed repair steps. Each MUST reference a specific measurement, parameter, terminal, or verifiable action. BANNED: "check wiring", "consult manual", "replace if necessary".`
    );

  const outputExample: Record<string, unknown> = { ref: 1 };
  if (needsCauses) outputExample.causes = ["..."];
  if (needsSteps) outputExample.fixSteps = ["..."];

  return `You are given industrial fault codes. Each has a numeric "ref" identifier. Return enriched data.

CRITICAL: Return the "ref" number EXACTLY as provided.

For each fault code, return:
${fields.join("\n")}

${FORMATTING_RULES}

Return shorter arrays rather than generic padding. Return ONLY valid JSON, no markdown.
Output: { "codes": [${JSON.stringify(outputExample)}] }`;
}

const args = process.argv.slice(2);
const BATCH_SIZE = args.includes("--small") ? 5 : 25;
const RATE_GAP_MS = 4_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type EnrichInput = { ref: number; code: string; title: string; desc: string };
type EnrichOutput = { ref: number; causes?: string[]; fixSteps?: string[] };

async function callGemini(
  codesContext: EnrichInput[],
  needsCauses: boolean,
  needsSteps: boolean,
  maxRetries = 3
): Promise<EnrichOutput[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const codeList = codesContext
    .map((c) => `- ref=${c.ref}: "${c.code}" — ${c.title}${needsSteps ? ` | ${c.desc.substring(0, 120)}` : ""}`)
    .join("\n");

  const prompt = `${buildPrompt(needsCauses, needsSteps)}\n\nFault codes:\n${codeList}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      return (parsed.codes || []).map((c: Record<string, unknown>) => ({
        ref: Number(c.ref),
        causes: (c.causes as string[]) || undefined,
        fixSteps: (c.fixSteps as string[]) || undefined,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("429") || msg.includes("503") ||
        msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") || msg.includes("overloaded");

      if (retryable && attempt < maxRetries) {
        const wait = 15 * (attempt + 1);
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
  const brandFilter = args.find((a) => a.startsWith("--brand="))?.split("=")[1];
  const manualFilter = args.find((a) => a.startsWith("--manual="))?.split("=")[1];
  const dryRun = args.includes("--dry");
  const force = args.includes("--force");

  console.log("🔧 ErrorLib Enrichment Script");
  if (force) console.log("⚡ FORCE MODE: re-processing all matching codes");
  console.log("━".repeat(50));

  const where: Record<string, unknown> = {};

  if (!force) {
    // Prisma's isEmpty/equals can miss empty PostgreSQL arrays via Neon adapter.
    // Use raw SQL to get reliable IDs, then filter.
    const emptyIds = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "FaultCode" WHERE array_length(causes, 1) IS NULL OR array_length("fixSteps", 1) IS NULL`
    );
    if (emptyIds.length === 0) {
      console.log("✅ All codes are already enriched!");
      return;
    }
    where.id = { in: emptyIds.map((r) => r.id) };
    console.log(`📌 Found ${emptyIds.length} codes via SQL that need enrichment`);
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
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      causes: true,
      fixSteps: true,
      manualId: true,
      manual: { select: { name: true, brand: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Determine what each code actually needs
  type CodeWithNeeds = (typeof unenriched)[number] & {
    needsCauses: boolean;
    needsSteps: boolean;
  };

  const codes: CodeWithNeeds[] = unenriched
    .map((fc) => ({
      ...fc,
      needsCauses: !fc.causes || fc.causes.length === 0,
      needsSteps: !fc.fixSteps || fc.fixSteps.length === 0,
    }))
    .filter((fc) => fc.needsCauses || fc.needsSteps);

  const onlyCauses = codes.filter((c) => c.needsCauses && !c.needsSteps).length;
  const onlySteps = codes.filter((c) => !c.needsCauses && c.needsSteps).length;
  const both = codes.filter((c) => c.needsCauses && c.needsSteps).length;

  console.log(`📊 Found ${codes.length} fault codes needing enrichment`);
  console.log(`   Causes only: ${onlyCauses} | Steps only: ${onlySteps} | Both: ${both}`);
  if (codes.length === 0) {
    console.log("✅ All codes are already enriched!");
    return;
  }

  // Group into "causes-only" and "both" batches for efficiency
  const causesOnlyQueue = codes.filter((c) => c.needsCauses && !c.needsSteps);
  const needsBothQueue = codes.filter((c) => c.needsSteps);

  const totalBatches =
    Math.ceil(causesOnlyQueue.length / BATCH_SIZE) +
    Math.ceil(needsBothQueue.length / BATCH_SIZE);

  console.log(`📦 ${totalBatches} API calls needed (batch size ${BATCH_SIZE})\n`);

  let totalEnriched = 0;
  let totalFailed = 0;
  let batchIdx = 0;

  async function processBatch(
    batch: CodeWithNeeds[],
    needsCauses: boolean,
    needsSteps: boolean,
    label: string
  ) {
    batchIdx++;
    if (batchIdx > 1) await sleep(RATE_GAP_MS);

    const tag = needsSteps ? "causes+steps" : "causes-only";
    console.log(`[${batchIdx}/${totalBatches}] ${tag} — ${batch.length} codes (${label})`);

    try {
      const enriched = await callGemini(
        batch.map((fc, i) => ({
          ref: i,
          code: fc.code,
          title: fc.title,
          desc: fc.description,
        })),
        needsCauses,
        needsSteps
      );

      const enrichMap = new Map(enriched.map((e) => [e.ref, e]));

      for (let i = 0; i < batch.length; i++) {
        const fc = batch[i];
        const data = enrichMap.get(i);
        if (!data) { totalFailed++; continue; }

        if (dryRun) {
          console.log(`  [DRY] ${fc.code}: ${data.causes?.length ?? 0}c ${data.fixSteps?.length ?? 0}s`);
          totalEnriched++;
          continue;
        }

        try {
          const update: Record<string, unknown> = {};
          if (needsCauses && data.causes && data.causes.length > 0) update.causes = data.causes;
          if (needsSteps && data.fixSteps && data.fixSteps.length > 0) update.fixSteps = data.fixSteps;
          if (Object.keys(update).length > 0) {
            update.translations = {};
            await prisma.faultCode.update({ where: { id: fc.id }, data: update });
            totalEnriched++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  ❌ ${fc.code}: ${msg.substring(0, 80)}`);
          totalFailed++;
        }
      }
      console.log(`  ✅ Done — Total: ${totalEnriched} enriched, ${totalFailed} failed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Batch failed: ${msg}`);
      totalFailed += batch.length;
    }
  }

  // Process causes-only codes first (cheaper — no description sent, smaller prompt)
  for (let i = 0; i < causesOnlyQueue.length; i += BATCH_SIZE) {
    const batch = causesOnlyQueue.slice(i, i + BATCH_SIZE);
    const manual = batch[0].manual;
    await processBatch(batch, true, false, `${manual.brand.name}/${manual.name}`);
  }

  // Then process codes needing both
  for (let i = 0; i < needsBothQueue.length; i += BATCH_SIZE) {
    const batch = needsBothQueue.slice(i, i + BATCH_SIZE);
    const manual = batch[0].manual;
    await processBatch(batch, true, true, `${manual.brand.name}/${manual.name}`);
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
