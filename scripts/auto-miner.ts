import "dotenv/config";
import path from "path";
import { log } from "./lib/logger.js";
import { searchManuals, extractManualName } from "./lib/search.js";
import { downloadPdf, ensureTempDir } from "./lib/download.js";
import { extractDiagnosticText } from "./lib/pdf-parser.js";
import { extractAndSave, preflight } from "./lib/extract.js";
import {
  upsertBrand,
  upsertManual,
  disconnect,
  getPrisma,
  createMiningLog,
} from "./lib/db.js";
import {
  isAlreadyMined,
  markCompleted,
  markFailed,
  getCacheStats,
  getTextCache,
  setTextCache,
  isBrandCompleted,
  markBrandCompleted,
  getMinedUrlsForBrand,
} from "./lib/cache.js";

const MAX_PDFS = 5;
const MAX_PAGES_PER_PDF = 15;
const COOLDOWN_BETWEEN_BRANDS_MS = 10_000;
const BRAND_DUPLICATE_THRESHOLD = 20;

const AUTO_BRANDS = [
  "ABB",
  "Danfoss",
  "Siemens",
  "Schneider Electric",
  "Yaskawa",
];

const NON_ENGLISH_MARKERS = [
  "benutzerhandbuch",
  "bedienungsanleitung",
  "instrucciones",
  "manual do usuário",
  "manuel d'utilisation",
  "manuale d'uso",
  "handleiding",
  "bruksanvisning",
  "käyttöohje",
  "instrukcja",
  "руководство",
  "取扱説明書",
  "说明书",
  "사용 설명서",
  "istruzioni",
  "gebrauchsanweisung",
  "handbuch",
  "betriebsanleitung",
  "guía de",
  "mode d'emploi",
];

type SavingsStats = {
  skippedBrandCompleted: number;
  skippedNonEnglish: number;
  skippedDuplicate: number;
  skippedNoRelevance: number;
  pagesFiltered: number;
  geminiCallsSaved: number;
};

function newSavings(): SavingsStats {
  return {
    skippedBrandCompleted: 0,
    skippedNonEnglish: 0,
    skippedDuplicate: 0,
    skippedNoRelevance: 0,
    pagesFiltered: 0,
    geminiCallsSaved: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBrandArg(): string | null {
  const args = process.argv.slice(2);

  if (args.includes("--all") || args.includes("-a")) return null;

  for (const arg of args) {
    const match = arg.match(/^--brand[=:](.+)$/i);
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--brand" && args[i + 1]) {
      return args[i + 1].replace(/^["']|["']$/g, "");
    }
  }

  if (args.length > 0 && !args[0].startsWith("-")) {
    return args[0];
  }

  return null;
}

function hasForceFlag(): boolean {
  return process.argv.slice(2).some((a) => a === "--force" || a === "-f");
}

function hasQueueFlag(): boolean {
  return process.argv.slice(2).some((a) => a === "--queue" || a === "-q");
}

async function fetchQueueBrands(): Promise<
  { id: string; brandName: string }[]
> {
  const prisma = getPrisma();

  // Reset stale "processing" queue items from interrupted runs
  await prisma.miningQueue.updateMany({
    where: { status: "processing" },
    data: { status: "pending" },
  });

  // Mark stale "started" mining logs as aborted
  await prisma.miningLog.updateMany({
    where: { status: "started" },
    data: { status: "aborted", message: "Miner was interrupted" },
  });

  return prisma.miningQueue.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

async function setQueueStatus(
  id: string,
  status: "processing" | "completed"
): Promise<void> {
  const prisma = getPrisma();
  await prisma.miningQueue.update({ where: { id }, data: { status } });
}

async function deleteQueueItem(id: string): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.miningQueue.delete({ where: { id } });
  } catch {}
}

function isNonEnglish(text: string): boolean {
  const sample = text.substring(0, 500).toLowerCase();
  for (const marker of NON_ENGLISH_MARKERS) {
    if (sample.includes(marker)) return true;
  }
  return false;
}

async function getBrandFaultCount(brand: string): Promise<number> {
  const prisma = getPrisma();
  const brandRec = await prisma.brand.findFirst({
    where: { name: { equals: brand, mode: "insensitive" } },
    include: { manuals: { include: { _count: { select: { faultCodes: true } } } } },
  });
  if (!brandRec) return 0;
  return brandRec.manuals.reduce((sum, m) => sum + m._count.faultCodes, 0);
}

async function mine(
  brand: string,
  force: boolean,
  savings: SavingsStats
): Promise<number> {
  const startTime = Date.now();
  log.banner(`MINING RIG - ${brand.toUpperCase()}`);

  // ─── PREFLIGHT: Check Gemini API ───
  log.step("\u{2705}", "Preflight: checking Gemini API availability...");
  const apiOk = await preflight();
  if (!apiOk) {
    log.error("Gemini API is rate-limited or quota exhausted. Try again later.");
    log.info("Wait a few minutes, or check https://aistudio.google.com/apikey");
    return 0;
  }
  log.success("Gemini API is available");

  // ─── DEDUP CHECK: How many codes do we already have? ───
  const existingCodes = await getBrandFaultCount(brand);
  if (existingCodes > 0) {
    log.info(`Brand already has ${existingCodes} fault codes in Neon`);
  }
  const minedUrls = getMinedUrlsForBrand(brand);

  // ─── PHASE 1: SEARCH ───
  log.step("\u{1F310}", "PHASE 1: Searching for English manuals...");
  const results = await searchManuals(brand, 10);
  log.info(`Found ${results.length} PDF results from Google`);

  if (results.length === 0) {
    log.error("No PDF manuals found. Skipping this brand.");
    return 0;
  }

  for (const r of results.slice(0, 8)) {
    log.detail(`  ${r.title}`);
    log.detail(`  ${r.link}`);
  }

  // ─── PHASE 2: DOWNLOAD (with dedup) ───
  log.step("\u{2B07}\u{FE0F}", "PHASE 2: Downloading PDFs...");
  ensureTempDir();

  const downloaded: { pdfPath: string; url: string; title: string }[] = [];
  let dupSkipped = 0;
  let fileCounter = 0;

  for (const result of results) {
    if (downloaded.length >= MAX_PDFS) break;

    fileCounter++;
    const filename = `${brand.toLowerCase().replace(/\s+/g, "-")}_${fileCounter}.pdf`;

    if (isAlreadyMined(filename, brand)) {
      log.info(`  [CACHE HIT] ${filename} already mined, skipping`);
      continue;
    }

    if (
      existingCodes > BRAND_DUPLICATE_THRESHOLD &&
      minedUrls.has(result.link)
    ) {
      log.info(`  [SAVINGS] Skipped duplicate URL (brand has ${existingCodes} codes): ${result.link.substring(0, 80)}`);
      dupSkipped++;
      savings.skippedDuplicate++;
      continue;
    }

    const pdfPath = await downloadPdf(result.link, filename);
    if (pdfPath) {
      downloaded.push({
        pdfPath,
        url: result.link,
        title: result.title,
      });
    }
  }

  if (dupSkipped > 0) {
    log.info(`  [SAVINGS] Skipped ${dupSkipped} duplicate manuals`);
  }

  if (downloaded.length === 0) {
    log.info("All PDFs already mined (or none downloadable). Nothing to do.");
    return 0;
  }

  log.info(`Downloaded ${downloaded.length} new PDFs to process`);

  // ─── PHASE 3: SCAN & EXTRACT TEXT ───
  log.step("\u{1F9E0}", "PHASE 3: Scanning for diagnostic pages (text extraction)...");

  const pdfTexts: {
    pdfPath: string;
    url: string;
    title: string;
    filename: string;
    pages: { pageNumber: number; text: string }[];
  }[] = [];

  let nonEnglishSkipped = 0;
  let noRelevanceSkipped = 0;

  for (const dl of downloaded) {
    const fn = path.basename(dl.pdfPath);
    const cached = getTextCache(fn, brand);

    if (cached) {
      log.info(`  [TEXT CACHE] ${fn}: ${cached.length} pages from cache`);

      // Language check even on cached text
      if (cached.length > 0 && isNonEnglish(cached[0].text)) {
        log.warn(`  [SAVINGS] Skipped non-English manual: ${fn}`);
        nonEnglishSkipped++;
        savings.skippedNonEnglish++;
        savings.geminiCallsSaved++;
        await createMiningLog({
          brand,
          manual: fn,
          codesFound: 0,
          pagesUsed: 0,
          durationMs: 0,
          status: "skipped",
          message: "Non-English content detected",
        });
        continue;
      }

      pdfTexts.push({ ...dl, filename: fn, pages: cached });
      continue;
    }

    const result = await extractDiagnosticText(dl.pdfPath, MAX_PAGES_PER_PDF);
    savings.pagesFiltered += result.stats.pagesFilteredLowRelevance;

    if (result.pages.length === 0) {
      log.warn(`  [SAVINGS] No relevant diagnostic pages: ${fn}`);
      noRelevanceSkipped++;
      savings.skippedNoRelevance++;
      savings.geminiCallsSaved++;
      setTextCache(fn, brand, []);
      await createMiningLog({
        brand,
        manual: fn,
        codesFound: 0,
        pagesUsed: 0,
        durationMs: 0,
        status: "skipped",
        message: `No relevant data — filtered ${result.stats.pagesFilteredLowRelevance} low-relevance pages`,
      });
      continue;
    }

    // Language check on extracted text
    if (isNonEnglish(result.pages[0].text)) {
      log.warn(`  [SAVINGS] Skipped non-English manual: ${fn}`);
      nonEnglishSkipped++;
      savings.skippedNonEnglish++;
      savings.geminiCallsSaved++;
      setTextCache(fn, brand, []);
      await createMiningLog({
        brand,
        manual: fn,
        codesFound: 0,
        pagesUsed: 0,
        durationMs: 0,
        status: "skipped",
        message: "Non-English content detected",
      });
      continue;
    }

    setTextCache(fn, brand, result.pages);
    pdfTexts.push({ ...dl, filename: fn, pages: result.pages });
  }

  if (nonEnglishSkipped > 0) {
    log.info(`  [SAVINGS] Skipped ${nonEnglishSkipped} non-English manuals`);
  }
  if (noRelevanceSkipped > 0) {
    log.info(`  [SAVINGS] Skipped ${noRelevanceSkipped} manuals with no relevant pages`);
  }

  const totalPages = pdfTexts.reduce((n, p) => n + p.pages.length, 0);
  if (totalPages === 0) {
    log.error("No diagnostic pages found in any PDFs. Skipping this brand.");
    return 0;
  }

  log.info(
    `Extracted text from ${totalPages} diagnostic pages across ${pdfTexts.length} PDFs`
  );

  // ─── PHASE 4: AI EXTRACTION ───
  log.step("\u{1F916}", "PHASE 4: Extracting fault codes with Gemini...");

  const brandRecord = await upsertBrand(brand);
  let grandTotal = 0;

  for (const pdf of pdfTexts) {
    const manualName = await extractManualName(pdf.title, pdf.url, brand);
    log.info(`Processing manual: ${manualName} (${pdf.pages.length} pages)`);

    const manual = await upsertManual(brandRecord.id, manualName, pdf.url);

    await createMiningLog({
      brand,
      manual: manualName,
      codesFound: 0,
      pagesUsed: pdf.pages.length,
      durationMs: 0,
      status: "started",
      message: `Processing ${pdf.pages.length} pages...`,
    });

    const manualStart = Date.now();
    try {
      const count = await extractAndSave(pdf.pages, manual.id, pdf.url);
      grandTotal += count;
      const durMs = Date.now() - manualStart;

      markCompleted(pdf.filename, pdf.url, brand, count);

      await createMiningLog({
        brand,
        manual: manualName,
        codesFound: count,
        pagesUsed: pdf.pages.length,
        durationMs: durMs,
        status: count > 0 ? "success" : "empty",
        message: count > 0 ? `Extracted ${count} codes` : "No codes found in pages",
      });

      log.success(`  -> ${count} fault codes from ${manualName} (${(durMs / 1000).toFixed(1)}s)`);
    } catch (err) {
      const durMs = Date.now() - manualStart;
      markFailed(pdf.filename, pdf.url, brand);

      const errMsg = err instanceof Error ? err.message.substring(0, 200) : "Unknown error";
      await createMiningLog({
        brand,
        manual: manualName,
        codesFound: 0,
        pagesUsed: pdf.pages.length,
        durationMs: durMs,
        status: "failed",
        message: errMsg,
      });
      log.error(`  Mining log: failed - ${errMsg}`);

      throw err;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.success(
    `${brand} complete: ${grandTotal} codes from ${pdfTexts.length} manuals in ${elapsed}s`
  );

  if (grandTotal > 0) {
    markBrandCompleted(brand, existingCodes + grandTotal);
  }

  return grandTotal;
}

async function mineWithRetry(
  brand: string,
  force: boolean,
  savings: SavingsStats,
  maxRetries = 3
): Promise<number> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await mine(brand, force, savings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("Too Many Requests") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        const waitSec = 60 * (attempt + 1);
        if (attempt < maxRetries) {
          log.warn(
            `[RATE LIMIT] Hit 429 for ${brand}. Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`
          );
          await sleep(waitSec * 1000);
          continue;
        }
        log.error(
          `[RATE LIMIT] Exhausted retries for ${brand} after ${maxRetries} attempts. Moving on.`
        );
        return 0;
      }

      throw err;
    }
  }
  return 0;
}

async function runBrandList(
  brands: string[],
  force: boolean,
  queueIds?: Map<string, string>
) {
  const globalStart = Date.now();
  let totalCodes = 0;
  const results: { brand: string; codes: number; status: string }[] = [];
  const savings = newSavings();

  const cacheStats = getCacheStats();
  const isQueue = !!queueIds;

  log.banner(
    brands.length === 1
      ? `MINING: ${brands[0]}`
      : isQueue
        ? `QUEUE MINING: ${brands.length} BRANDS`
        : `AUTONOMOUS MINING: ${brands.length} BRANDS`
  );
  if (force) log.warn("--force flag active: re-mining completed brands");
  log.info(`Cache: ${cacheStats.completed} manuals already mined`);

  if (brands.length > 1) {
    log.info(`Queue: ${brands.join(" -> ")}`);
    log.info("");
  }

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const queueId = queueIds?.get(brand);

    if (brands.length > 1) {
      log.banner(`BRAND ${i + 1}/${brands.length}: ${brand.toUpperCase()}`);
    }

    if (queueId) {
      await setQueueStatus(queueId, "processing");
      log.info(`Queue status -> processing`);
    }

    // ─── INCREMENTAL: Skip completed brands unless --force ───
    if (!force && isBrandCompleted(brand)) {
      log.info(`[SAVINGS] Brand "${brand}" already completed. Use --force to re-mine.`);
      savings.skippedBrandCompleted++;
      results.push({ brand, codes: 0, status: "CACHED" });
      await createMiningLog({
        brand,
        manual: "(all)",
        codesFound: 0,
        pagesUsed: 0,
        durationMs: 0,
        status: "skipped",
        message: "Brand already completed — use --force to re-mine",
      });
      if (queueId) await deleteQueueItem(queueId);
      continue;
    }

    try {
      const count = await mineWithRetry(brand, force, savings);
      totalCodes += count;
      results.push({
        brand,
        codes: count,
        status: count > 0 ? "OK" : "EMPTY",
      });

      if (queueId) {
        await setQueueStatus(queueId, "completed");
        log.info(`Queue status -> completed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Fatal error mining ${brand}: ${msg}`);
      results.push({ brand, codes: 0, status: "FAILED" });

      if (queueId) {
        await setQueueStatus(queueId, "completed");
      }
    }

    if (i < brands.length - 1) {
      log.info(
        `Cooling down ${COOLDOWN_BETWEEN_BRANDS_MS / 1000}s before next brand...`
      );
      await sleep(COOLDOWN_BETWEEN_BRANDS_MS);
    }
  }

  // ─── FINAL SUMMARY ───
  const prisma = getPrisma();
  const dbBrands = await prisma.brand.count();
  const dbManuals = await prisma.manual.count();
  const dbFaults = await prisma.faultCode.count();
  const elapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
  const finalCache = getCacheStats();

  log.banner("MINING COMPLETE");
  log.info("");
  log.info("Results per brand:");
  for (const r of results) {
    const icon =
      r.status === "OK"
        ? "\u2705"
        : r.status === "EMPTY"
          ? "\u26A0\uFE0F"
          : r.status === "CACHED"
            ? "\u{1F4BE}"
            : "\u274C";
    log.info(
      `  ${icon} ${r.brand.padEnd(22)} ${r.codes} codes  [${r.status}]`
    );
  }

  // ─── SAVINGS REPORT ───
  const totalSaved =
    savings.skippedBrandCompleted +
    savings.skippedNonEnglish +
    savings.skippedDuplicate +
    savings.skippedNoRelevance;

  if (totalSaved > 0 || savings.pagesFiltered > 0) {
    log.info("");
    log.success("Cost Savings Report:");
    if (savings.skippedBrandCompleted > 0) {
      log.info(`  Brands skipped (already completed):    ${savings.skippedBrandCompleted}`);
    }
    if (savings.skippedNonEnglish > 0) {
      log.info(`  Manuals skipped (non-English):          ${savings.skippedNonEnglish}`);
    }
    if (savings.skippedDuplicate > 0) {
      log.info(`  Manuals skipped (duplicate content):    ${savings.skippedDuplicate}`);
    }
    if (savings.skippedNoRelevance > 0) {
      log.info(`  Manuals skipped (no relevant pages):    ${savings.skippedNoRelevance}`);
    }
    if (savings.pagesFiltered > 0) {
      log.info(`  Pages filtered (low relevance):         ${savings.pagesFiltered}`);
    }
    if (savings.geminiCallsSaved > 0) {
      log.info(`  Gemini API calls saved:                 ${savings.geminiCallsSaved}`);
    }
  }

  log.info("");
  log.success(`Total new codes:  ${totalCodes}`);
  log.success(`Time elapsed:     ${elapsed}s`);
  log.success(`Cached manuals:   ${finalCache.completed}`);
  log.info("");
  log.info("Database totals:");
  log.info(`  Brands:      ${dbBrands}`);
  log.info(`  Manuals:     ${dbManuals}`);
  log.info(`  Fault codes: ${dbFaults}`);
  log.info("");
  log.info("Site is live at: https://error-lib.vercel.app");
}

async function main() {
  const singleBrand = parseBrandArg();
  const force = hasForceFlag();
  const useQueue = hasQueueFlag();

  // ─── QUEUE MODE: Pull pending brands from the database ───
  if (useQueue) {
    const queueItems = await fetchQueueBrands();

    if (queueItems.length === 0) {
      log.banner("QUEUE MINING");
      log.info("No pending brands in the queue.");
      log.info("Add brands via the Admin Dashboard at /admin");
      await disconnect();
      return;
    }

    const brands = queueItems.map((q) => q.brandName);
    const queueIds = new Map(queueItems.map((q) => [q.brandName, q.id]));

    log.info(`Found ${queueItems.length} pending brand(s) in queue`);
    await runBrandList(brands, force, queueIds);
    await disconnect();
    return;
  }

  // ─── STANDARD MODE: CLI args or auto brands ───
  const brands = singleBrand !== null ? [singleBrand] : AUTO_BRANDS;

  if (brands.length === 0 || (brands.length === 1 && !brands[0])) {
    console.log(`
Usage:
  npm run mine -- --brand="ABB"         Mine a single brand
  npm run mine -- --brand="ABB" --force Re-mine even if completed
  npm run mine -- --queue               Mine brands from the admin queue
  npm run mine -- --all                 Mine all 5 default brands
  npm run mine                          Mine all 5 default brands

Default brands: ${AUTO_BRANDS.join(", ")}
`);
    process.exit(1);
  }

  await runBrandList(brands, force);
  await disconnect();
}

main().catch(async (err) => {
  log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) log.detail(err.stack);
  await disconnect();
  process.exit(1);
});
