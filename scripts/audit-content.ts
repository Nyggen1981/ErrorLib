/**
 * Audit quality of repair guidance (FaultCode.fixSteps) per brand.
 *
 * Run: npx tsx scripts/audit-content.ts
 *      npm run db:audit
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

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
  if (!raw) {
    throw new Error("Set DATABASE_URL or DIRECT_URL in .env");
  }
  const url = postgresUrlWithExplicitSslMode(raw);
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

/** True if repair steps are missing: null/undefined, not an array, [], or only empty/whitespace strings. */
function isMissingFixSteps(fixSteps: string[] | null | undefined): boolean {
  if (fixSteps == null) return true;
  if (!Array.isArray(fixSteps)) return true;
  if (fixSteps.length === 0) return true;
  return !fixSteps.some((s) => typeof s === "string" && s.trim() !== "");
}

type Row = {
  brand: string;
  slug: string;
  totalCodes: number;
  missing: number;
  pct: number;
};

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w - 1) + "…" : s + " ".repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return " ".repeat(Math.max(0, w - s.length)) + s;
}

async function main() {
  const { prisma, pool } = connect();
  try {
    const brands = await prisma.brand.findMany({
      include: {
        manuals: {
          include: {
            faultCodes: { select: { fixSteps: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const rows: Row[] = [];

    for (const b of brands) {
      let totalCodes = 0;
      let missing = 0;
      for (const m of b.manuals) {
        for (const fc of m.faultCodes) {
          totalCodes++;
          if (isMissingFixSteps(fc.fixSteps)) missing++;
        }
      }
      const pct = totalCodes === 0 ? 0 : (missing / totalCodes) * 100;
      rows.push({
        brand: b.name,
        slug: b.slug,
        totalCodes,
        missing,
        pct,
      });
    }

    rows.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      if (b.missing !== a.missing) return b.missing - a.missing;
      return a.brand.localeCompare(b.brand);
    });

    const wBrand = 28;
    const wSlug = 22;
    const wTot = 8;
    const wMiss = 10;
    const wPct = 10;

    console.log("\nRepair guidance audit (FaultCode.fixSteps)\n");
    console.log(
      `${pad("Brand", wBrand)} ${pad("Slug", wSlug)} ${padLeft("Codes", wTot)} ${padLeft("Missing", wMiss)} ${padLeft("% miss", wPct)}`
    );
    console.log("-".repeat(wBrand + wSlug + wTot + wMiss + wPct + 4));

    let grandTotal = 0;
    let grandMissing = 0;

    for (const r of rows) {
      grandTotal += r.totalCodes;
      grandMissing += r.missing;
      const pctStr = r.totalCodes === 0 ? "—" : `${r.pct.toFixed(1)}%`;
      console.log(
        `${pad(r.brand, wBrand)} ${pad(r.slug, wSlug)} ${padLeft(String(r.totalCodes), wTot)} ${padLeft(String(r.missing), wMiss)} ${padLeft(pctStr, wPct)}`
      );
    }

    console.log("-".repeat(wBrand + wSlug + wTot + wMiss + wPct + 4));
    const overallPct =
      grandTotal === 0 ? 0 : (grandMissing / grandTotal) * 100;
    console.log(
      `\nTotal (all brands): ${grandTotal} fault code(s), ${grandMissing} missing repair steps (${overallPct.toFixed(1)}%).\n`
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
