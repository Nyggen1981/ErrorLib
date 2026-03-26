/**
 * UI-oriented manual name / slug cleanup (series grouping alignment).
 *
 * - Huawei SUN2000 + SMA Sunny Boy: series buckets come from extractSeries() in
 *   src/lib/brand-series-grouping.ts (no SQL for those brands).
 * - Fronius: normalize "Symo Advanced User" → "Symo Advanced" on Manual.name (+ slug).
 * - Fanuc: washManualTitle() on every manual name (+ slug, collision-safe).
 *
 * Dry-run: npx tsx scripts/cleanup-db.ts
 * Apply:   npx tsx scripts/cleanup-db.ts --execute
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { washManualTitle } from "../src/lib/manual-title-wash.js";

const EXECUTE = process.argv.includes("--execute");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Makes sslmode explicit so node-pg stops warning that require/prefer will change meaning in pg v9.
 * See: https://www.postgresql.org/docs/current/libpq-ssl.html
 */
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

/** TCP postgres (pg) — works where @prisma/adapter-neon WebSockets fail (e.g. some CI/agents). */
function connect(): { prisma: PrismaClient; pool: Pool } {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Set DATABASE_URL or DIRECT_URL in .env");
  }
  const url = postgresUrlWithExplicitSslMode(raw);
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

async function ensureUniqueManualSlug(
  prisma: PrismaClient,
  desired: string,
  excludeManualId: string
): Promise<string> {
  let candidate = desired;
  let n = 0;
  for (;;) {
    const clash = await prisma.manual.findFirst({
      where: {
        slug: candidate,
        id: { not: excludeManualId },
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    n += 1;
    candidate = `${desired}-${n}`;
  }
}

function logGroupingNote() {
  console.log(
    "[Huawei / SMA] Series groups 'SUN2000 Series' and 'Sunny Boy Series' are applied in UI via src/lib/brand-series-grouping.ts (extractSeries). No manual rows required for those rules."
  );
}

async function mergeFroniusSymoAdvanced(prisma: PrismaClient) {
  const brand = await prisma.brand.findUnique({ where: { slug: "fronius" } });
  if (!brand) {
    console.log("[Fronius] Brand slug 'fronius' not found — skip.");
    return;
  }

  const manuals = await prisma.manual.findMany({
    where: {
      brandId: brand.id,
      name: { contains: "Symo Advanced User", mode: "insensitive" },
    },
    select: { id: true, name: true, slug: true },
  });

  if (manuals.length === 0) {
    console.log("[Fronius] No manuals matching 'Symo Advanced User' — skip.");
    return;
  }

  for (const m of manuals) {
    const newName = m.name.replace(/\bSymo\s+Advanced\s+User\b/gi, "Symo Advanced");
    const baseSlug = slugify(washManualTitle(newName));
    const newSlug = await ensureUniqueManualSlug(prisma, baseSlug, m.id);
    console.log(
      `[Fronius] "${m.name.slice(0, 70)}${m.name.length > 70 ? "…" : ""}"\n         → name: "${newName.slice(0, 70)}…"\n         → slug: ${m.slug} → ${newSlug}`
    );
    if (!EXECUTE) continue;
    await prisma.manual.update({
      where: { id: m.id },
      data: { name: newName, slug: newSlug },
    });
  }
  if (EXECUTE) console.log(`[Fronius] Updated ${manuals.length} manual(s).`);
}

async function washFanucManuals(prisma: PrismaClient) {
  const brand = await prisma.brand.findUnique({ where: { slug: "fanuc" } });
  if (!brand) {
    console.log("[Fanuc] Brand slug 'fanuc' not found — skip.");
    return;
  }

  const manuals = await prisma.manual.findMany({
    where: { brandId: brand.id },
    select: { id: true, name: true, slug: true },
  });

  let changed = 0;
  for (const m of manuals) {
    const newName = washManualTitle(m.name);
    const baseSlug = slugify(newName);
    const newSlug = await ensureUniqueManualSlug(prisma, baseSlug, m.id);
    if (newName === m.name && newSlug === m.slug) continue;

    console.log(
      `[Fanuc] ${m.slug}\n       name: "${m.name.slice(0, 72)}${m.name.length > 72 ? "…" : ""}"\n       → "${newName.slice(0, 72)}${newName.length > 72 ? "…" : ""}"\n       slug → ${newSlug}`
    );
    changed++;
    if (!EXECUTE) continue;
    await prisma.manual.update({
      where: { id: m.id },
      data: { name: newName, slug: newSlug },
    });
  }

  if (changed === 0) {
    console.log("[Fanuc] No name/slug changes needed.");
  } else if (EXECUTE) {
    console.log(`[Fanuc] Updated ${changed} manual(s).`);
  } else {
    console.log(`[Fanuc] Dry-run: ${changed} manual(s) would be updated.`);
  }
}

async function main() {
  console.log(EXECUTE ? "MODE: --execute (writing)\n" : "MODE: dry-run (no writes)\n");

  const { prisma, pool } = connect();
  try {
    logGroupingNote();
    await mergeFroniusSymoAdvanced(prisma);
    await washFanucManuals(prisma);
    console.log("\nDone.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
