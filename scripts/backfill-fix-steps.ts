/**
 * Backfill FaultCode.fixSteps via Gemini for rows missing repair guidance.
 *
 *   npx tsx scripts/backfill-fix-steps.ts           # apply updates
 *   npx tsx scripts/backfill-fix-steps.ts --dry-run # no DB writes
 *   npx tsx scripts/backfill-fix-steps.ts --limit=20
 *
 * Requires: GEMINI_API_KEY, DATABASE_URL or DIRECT_URL
 *
 * Default: 3 parallel Gemini calls per batch, 3s pause between batches (BACKFILL_FIX_STEPS_GAP_MS).
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = (() => {
  if (!LIMIT_ARG) return undefined;
  const n = parseInt(LIMIT_ARG.split("=")[1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();

const MODEL_ID = "gemini-2.5-flash";
const CONCURRENCY = 3;
const GAP_MS = Math.max(
  0,
  parseInt(process.env.BACKFILL_FIX_STEPS_GAP_MS ?? "3000", 10) || 3000
);

function postgresUrlWithExplicitSslMode(connectionString: string): string {
  let cs = connectionString
    .replace(/\bsslmode=require\b/gi, "sslmode=verify-full")
    .replace(/\bsslmode=prefer\b/gi, "sslmode=verify-full")
    .replace(/\bsslmode=verify-ca\b/gi, "sslmode=verify-full");
  if (!/\bsslmode=/i.test(cs) && /neon\.tech/i.test(cs)) {
    const j = cs.includes("?") ? "&" : "?";
    cs = `${cs}${j}sslmode=verify-full`;
  }
  return cs;
}

function connect(): { prisma: PrismaClient; pool: Pool } {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL or DIRECT_URL in .env");
  const url = postgresUrlWithExplicitSslMode(raw);
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

let _genAI: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set in .env");
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

function getBackfillModel() {
  const systemInstruction = `You are a senior field service engineer for industrial automation (drives, PLCs, robots, CNC, process equipment). You output ONLY valid JSON — no markdown fences, no commentary.`;

  return getGemini().getGenerativeModel({
    model: MODEL_ID,
    systemInstruction,
  });
}

function isMissingFixSteps(fixSteps: string[] | null | undefined): boolean {
  if (fixSteps == null) return true;
  if (!Array.isArray(fixSteps)) return true;
  if (fixSteps.length === 0) return true;
  return !fixSteps.some((s) => typeof s === "string" && s.trim() !== "");
}

function parseFixStepsJson(raw: string): string[] | null {
  const cleaned = raw
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out = parsed
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    if (out.length < 3) return null;
    return out.slice(0, 6);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUserPrompt(
  code: string,
  title: string,
  description: string,
  brandName: string,
  manualName: string
): string {
  return `Kontekst: Du er en Senior Field Service Engineer. Feilkode: ${code}, Navn: ${title}, Beskrivelse: ${description}, Utstyr: ${brandName} ${manualName}.

Oppgave: Generer 3-5 logiske, tekniske reparasjonstrinn (fixSteps) som en tekniker bør utføre. Bruk aktive verb som Verify, Measure, Inspect, Check.

Sikkerhet: Fokuser på ikke-destruktive trinn (måle spenning, sjekke kabling, verifisere parametere). Ikke gjett på interne komponentfeil hvis det ikke er åpenbart fra beskrivelsen.

Returner KUN gyldig JSON: et array av 3-5 strenger, f.eks. ["Verify supply voltage at input terminals against nominal", "Inspect motor cable for damage and loose connections"]. Ingen annen tekst.`;
}

async function generateFixSteps(
  code: string,
  title: string,
  description: string,
  brandName: string,
  manualName: string,
  logLabel: string,
  maxRetries = 4
): Promise<string[] | null> {
  const model = getBackfillModel();
  const prompt = buildUserPrompt(code, title, description, brandName, manualName);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      for (let parseTry = 0; parseTry < 2; parseTry++) {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const steps = parseFixStepsJson(text);
        if (steps) return steps;
        if (parseTry === 0) await sleep(2000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const rateLimited =
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("RESOURCE_EXHAUSTED");
      if (rateLimited && attempt < maxRetries) {
        const wait = 45 * (attempt + 1);
        console.warn(`[${logLabel}] Rate limit — waiting ${wait}s (backoff)...`);
        await sleep(wait * 1000);
        continue;
      }
      // Transient fetch / TLS / overload (often shows as "Error fetching from ... generativelanguage")
      const transient =
        /error fetching/i.test(msg) ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("EPIPE") ||
        msg.includes("socket hang up") ||
        msg.includes("fetch failed") ||
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded");
      if (transient && attempt < maxRetries) {
        const wait = 12 * (attempt + 1);
        console.warn(
          `[${logLabel}] Transient API/network error — retry in ${wait}s...`
        );
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  return null;
}

type FaultRow = Awaited<
  ReturnType<
    PrismaClient["faultCode"]["findMany"]
  >
>[number];

type ProcessResult = {
  code: string;
  brand: string;
  manualSlug: string;
  ok: boolean;
  stepCount?: number;
  failReason?: string;
};

async function processOne(
  prisma: PrismaClient,
  fc: FaultRow
): Promise<ProcessResult> {
  const brandName = fc.manual.brand.name;
  const manualSlug = fc.manual.slug;
  const logLabel = `${fc.code}@${manualSlug}`;
  try {
    const steps = await generateFixSteps(
      fc.code,
      fc.title,
      fc.description,
      brandName,
      fc.manual.name,
      logLabel
    );
    if (!steps) {
      return {
        code: fc.code,
        brand: brandName,
        manualSlug,
        ok: false,
        failReason: "ingen gyldige steg fra modellen",
      };
    }
    if (!DRY_RUN) {
      await prisma.faultCode.update({
        where: { id: fc.id },
        data: { fixSteps: steps },
      });
    }
    return {
      code: fc.code,
      brand: brandName,
      manualSlug,
      ok: true,
      stepCount: steps.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      code: fc.code,
      brand: brandName,
      manualSlug,
      ok: false,
      failReason: msg.length > 100 ? `${msg.slice(0, 97)}...` : msg,
    };
  }
}

function logBatchResults(results: ProcessResult[]) {
  for (const r of results) {
    const ctx = `${r.code} [${r.manualSlug}] for ${r.brand}`;
    if (r.ok) {
      const extra =
        DRY_RUN && r.stepCount != null
          ? ` (dry-run, ${r.stepCount} steg)`
          : "";
      console.log(`Reparerer ${ctx}... OK${extra}`);
    } else {
      console.log(
        `Reparerer ${ctx}... FEILET (${r.failReason ?? "ukjent"})`
      );
    }
  }
}

async function main() {
  const { prisma, pool } = connect();

  try {
    const rows = await prisma.faultCode.findMany({
      include: {
        manual: { include: { brand: true } },
      },
      orderBy: [{ manual: { brand: { name: "asc" } } }, { code: "asc" }],
    });

    const targets = rows.filter((r) => isMissingFixSteps(r.fixSteps));
    const slice = LIMIT ? targets.slice(0, LIMIT) : targets;

    console.log(
      DRY_RUN
        ? `\n[DRY-RUN] Would process ${slice.length} fault code(s) (missing fixSteps). Concurrency: ${CONCURRENCY}, gap: ${GAP_MS}ms.\n`
        : `\nProcessing ${slice.length} fault code(s) with missing fixSteps. Concurrency: ${CONCURRENCY}, gap: ${GAP_MS}ms.\n`
    );

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < slice.length; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((fc) => processOne(prisma, fc)));
      logBatchResults(results);
      for (const r of results) {
        if (r.ok) ok++;
        else fail++;
      }
      const more = i + CONCURRENCY < slice.length;
      if (more && GAP_MS > 0) {
        await sleep(GAP_MS);
      }
    }

    console.log(
      `\nFerdig. OK: ${ok}, feilet: ${fail}${DRY_RUN ? " (ingen DB-oppdateringer)" : ""}.\n`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
