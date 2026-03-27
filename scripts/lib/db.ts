import { PrismaClient } from "../../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { log } from "./logger.js";
import { sanitizeTitle } from "../../src/lib/manual-title-wash.js";

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const adapter = new PrismaNeon({
      connectionString: process.env.DATABASE_URL!,
    });
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

export async function disconnect() {
  await flushDbQueue();
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function upsertBrand(name: string) {
  const prisma = getPrisma();
  return prisma.brand.upsert({
    where: { slug: slugify(name) },
    update: { name },
    create: { name, slug: slugify(name) },
  });
}

export async function upsertManual(
  brandId: string,
  name: string,
  pdfUrl?: string
) {
  const prisma = getPrisma();
  // Single source of truth: stored name and slug always derive from washed title
  // (no leading [PDF]/Manual noise, no Greek letters in slug).
  const cleanName = sanitizeTitle(name);
  const slug = slugify(cleanName);
  return prisma.manual.upsert({
    where: { slug },
    update: { name: cleanName, pdfUrl },
    create: {
      name: cleanName,
      slug,
      brandId,
      pdfUrl,
    },
  });
}

export async function upsertFaultCode(
  manualId: string,
  code: string,
  title: string,
  description: string,
  fixSteps: string[],
  precomputedSlug?: string,
  sourceUrl?: string,
  sourcePage?: number,
  causes?: string[]
) {
  const prisma = getPrisma();

  const existing = await prisma.faultCode.findFirst({
    where: { code, manualId },
  });

  if (existing) {
    return prisma.faultCode.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        fixSteps,
        ...(sourceUrl && { sourceUrl }),
        ...(sourcePage != null && { sourcePage }),
        ...(causes && causes.length > 0 && { causes }),
      },
    });
  }

  const baseSlug = precomputedSlug && precomputedSlug.trim().length > 0
    ? precomputedSlug
    : slugify(`${code}-${title}`);
  let slug = baseSlug;
  let attempt = 0;

  while (true) {
    try {
      return await prisma.faultCode.create({
        data: {
          code,
          slug,
          title,
          description,
          fixSteps,
          manualId,
          sourceUrl,
          sourcePage,
          ...(causes && causes.length > 0 && { causes }),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") && attempt < 3) {
        attempt++;
        slug = `${baseSlug}-${manualId.slice(-6)}-${attempt}`;
        continue;
      }
      throw err;
    }
  }
}

export async function enrichFaultCode(
  manualId: string,
  code: string,
  data: {
    causes?: string[];
    fixSteps?: string[];
    description?: string;
    sourcePage?: number;
  }
): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.faultCode.findFirst({
    where: { code, manualId },
  });
  if (!existing) return false;

  const update: Record<string, unknown> = {};
  if (data.causes && data.causes.length > 0) update.causes = data.causes;
  if (data.fixSteps && data.fixSteps.length > 0) update.fixSteps = data.fixSteps;
  if (data.description && data.description.length > existing.description.length) update.description = data.description;
  if (data.sourcePage != null && !existing.sourcePage) update.sourcePage = data.sourcePage;

  if (Object.keys(update).length === 0) return false;

  update.translations = {};

  await prisma.faultCode.update({ where: { id: existing.id }, data: update });
  return true;
}

// ─── Mining Log ───

export async function createMiningLog(entry: {
  brand: string;
  manual: string;
  codesFound: number;
  pagesUsed: number;
  durationMs: number;
  status: string;
  message?: string;
}) {
  try {
    const prisma = getPrisma();
    await prisma.miningLog.create({ data: entry });
    log.detail(`  [LOG] ${entry.status}: ${entry.brand} / ${entry.manual}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  [LOG FAILED] Could not write mining log: ${msg.substring(0, 150)}`);
  }
}

// ─── Background DB Queue ───
// Queues upsert work so Gemini calls are not blocked by DB round-trips.

type QueueItem = {
  manualId: string;
  code: string;
  title: string;
  description: string;
  fixSteps: string[];
  slug?: string;
  sourceUrl?: string;
  sourcePage?: number;
  causes?: string[];
};

let _queue: QueueItem[] = [];
let _flushing: Promise<number> | null = null;

export function enqueueFaultCode(item: QueueItem) {
  _queue.push(item);
}

export async function flushDbQueue(): Promise<number> {
  if (_flushing) await _flushing;

  const items = _queue.splice(0);
  if (items.length === 0) return 0;

  _flushing = (async () => {
    let saved = 0;
    for (const item of items) {
      try {
        await upsertFaultCode(
          item.manualId,
          item.code,
          item.title,
          item.description,
          item.fixSteps,
          item.slug,
          item.sourceUrl,
          item.sourcePage,
          item.causes
        );
        saved++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`  DB write failed for ${item.code}: ${msg.substring(0, 100)}`);
      }
    }
    return saved;
  })();

  const count = await _flushing;
  _flushing = null;
  return count;
}

export function queueSize(): number {
  return _queue.length;
}
