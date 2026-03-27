import "dotenv/config";
import path from "path";
import { log } from "./lib/logger.js";
import {
  searchManuals,
  extractManualName,
  isConsumerSkipManualName,
} from "./lib/search.js";
import { shouldSkipManual } from "../src/lib/industrial-filter.js";
import { downloadPdf, ensureTempDir } from "./lib/download.js";
import { extractDiagnosticText } from "./lib/pdf-parser.js";
import { extractAndSave, extractWithOcr, preflight, sanitizeTitle } from "./lib/extract.js";
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
import { notifyUsersForBrand } from "./lib/notify.js";

const MAX_PDFS = 5;
const MAX_PAGES_PER_PDF = 15;
const COOLDOWN_BETWEEN_BRANDS_MS = 10_000;
const QUEUE_POLL_INTERVAL_MS = 30_000;
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

function sanitizeTitleLocal(title: string): string {
  return sanitizeTitle(title);
}

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

const SITEMAP_URL = "https://errorlib.net/sitemap.xml";

async function pingSitemap(): Promise<void> {
  const urls = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "GET" });
      const engine = url.includes("google") ? "Google" : "Bing";
      if (res.ok) {
        log.success(`[PING] ${engine} sitemap ping OK`);
      } else {
        log.warn(`[PING] ${engine} responded ${res.status}`);
      }
    } catch (err) {
      log.warn(`[PING] Failed: ${err}`);
    }
  }
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

async function resetStaleQueueItems(): Promise<void> {
  const prisma = getPrisma();
  await prisma.miningQueue.updateMany({
    where: { status: "processing" },
    data: { status: "pending" },
  });
  await prisma.miningLog.updateMany({
    where: { status: "started" },
    data: { status: "aborted", message: "Miner was interrupted" },
  });
}

async function fetchQueueBrands(): Promise<
  { id: string; brandName: string; force: boolean; manualId: string | null; targetManuals: string[] }[]
> {
  const prisma = getPrisma();
  try {
    return await prisma.miningQueue.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Backward compatibility: database may not yet have new columns (force/manualId).
    if (msg.toLowerCase().includes("column") || msg.includes("P2022")) {
      log.warn(
        "[QUEUE] MiningQueue schema appears outdated (missing columns). Falling back to legacy queue mode."
      );
      const legacy = await prisma.$queryRaw<
        { id: string; brandName: string; targetManuals: string[] }[]
      >`SELECT "id", "brandName", "targetManuals" FROM "MiningQueue" WHERE "status" = 'pending' ORDER BY "createdAt" ASC`;
      return legacy.map((q) => ({
        id: q.id,
        brandName: q.brandName,
        targetManuals: Array.isArray(q.targetManuals) ? q.targetManuals : [],
        force: false,
        manualId: null,
      }));
    }
    throw err;
  }
}

async function setQueueStatus(
  id: string,
  status: "processing" | "completed"
): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.miningQueue.update({ where: { id }, data: { status } });
  } catch {
    // Record may have been removed via admin UI — ignore
  }
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

function parseQueueTargets(rawTargets?: string[]): {
  isForceRetry: boolean;
  shouldOverwrite: boolean;
  manualIds: string[];
  targetManuals?: string[];
} {
  const entries = rawTargets ?? [];
  const isForceRetry = entries.includes("__FORCE_RETRY__");
  const shouldOverwrite = entries.includes("__OVERWRITE__");
  const manualIds = entries
    .filter((t) => t.startsWith("__MANUAL_ID__:"))
    .map((t) => t.replace("__MANUAL_ID__:", "").trim())
    .filter(Boolean);
  const targetManuals = entries.filter((t) => !t.startsWith("__"));
  return {
    isForceRetry,
    shouldOverwrite,
    manualIds,
    targetManuals: targetManuals.length > 0 ? targetManuals : undefined,
  };
}

async function mineSpecificManual(
  brand: string,
  manualId: string,
  shouldOverwrite: boolean
): Promise<number> {
  const prisma = getPrisma();
  const manual = await prisma.manual.findUnique({
    where: { id: manualId },
    include: { brand: true },
  });
  if (!manual) {
    log.warn(`[MANUAL RETRY] Manual ${manualId} not found`);
    return 0;
  }
  if (!manual.pdfUrl) {
    log.warn(`[MANUAL RETRY] ${manual.name} has no PDF URL`);
    return 0;
  }

  const effectiveBrand = manual.brand.name || brand;
  const filename = `${effectiveBrand.toLowerCase().replace(/\s+/g, "-")}_${manual.slug}.pdf`;
  log.step("🔁", `[MANUAL RETRY] ${manual.name} (${manual.id})`);

  await prisma.miningLog.deleteMany({
    where: {
      brand: effectiveBrand,
      manual: manual.name,
    },
  });

  await createMiningLog({
    brand: effectiveBrand,
    manual: manual.name,
    codesFound: 0,
    pagesUsed: 0,
    durationMs: 0,
    status: "started",
    message: `Manual force retry (overwrite=${shouldOverwrite})`,
  });

  const start = Date.now();
  const pdfPath = await downloadPdf(manual.pdfUrl, filename);
  if (!pdfPath) {
    await createMiningLog({
      brand: effectiveBrand,
      manual: manual.name,
      codesFound: 0,
      pagesUsed: 0,
      durationMs: Date.now() - start,
      status: "failed",
      message: "Failed to download PDF",
    });
    return 0;
  }

  if (shouldOverwrite) {
    const deleted = await prisma.faultCode.deleteMany({
      where: {
        manualId: manual.id,
        OR: [
          { code: "" },
          { title: "" },
          { description: "" },
          { fixSteps: { isEmpty: true } },
        ],
      },
    });
    log.warn(`  [MANUAL RETRY] Force cleanup removed ${deleted.count} empty fault code row(s)`);
  }

  const scan = await extractDiagnosticText(pdfPath, MAX_PAGES_PER_PDF);
  let count = 0;
  if (scan.pages.length > 0) {
    count = await extractAndSave(scan.pages, manual.id, manual.pdfUrl, {
      brandName: effectiveBrand,
      manualName: manual.name,
    });
  }
  if (count === 0) {
    log.info("  [MANUAL RETRY] Text extraction empty, trying OCR fallback...");
    count = await extractWithOcr(pdfPath, manual.id, manual.pdfUrl, {
      brandName: effectiveBrand,
      manualName: manual.name,
    });
  }

  markCompleted(filename, manual.pdfUrl, effectiveBrand, count);
  await createMiningLog({
    brand: effectiveBrand,
    manual: manual.name,
    codesFound: count,
    pagesUsed: scan.pages.length,
    durationMs: Date.now() - start,
    status: count > 0 ? "success" : "empty",
    message: count > 0 ? "Manual force retry completed" : "No codes found on manual force retry",
  });
  return count;
}

async function mine(
  brand: string,
  force: boolean,
  savings: SavingsStats,
  targetManuals?: string[],
  manualIds?: string[],
  shouldOverwrite = false
): Promise<number> {
  if (manualIds && manualIds.length > 0) {
    let total = 0;
    for (const manualId of manualIds) {
      total += await mineSpecificManual(brand, manualId, shouldOverwrite);
    }
    return total;
  }

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
  const isExpand = targetManuals && targetManuals.length > 0;
  log.step(
    "\u{1F310}",
    isExpand
      ? `PHASE 1: Targeted search for ${targetManuals.length} product series...`
      : "PHASE 1: Searching for English manuals..."
  );
  const maxPdfs = isExpand ? Math.max(MAX_PDFS, targetManuals.length * 2) : 10;
  const results = await searchManuals(brand, maxPdfs, targetManuals);
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
  const downloadLimit = isExpand ? Math.max(MAX_PDFS, (targetManuals?.length ?? 0) * 2) : MAX_PDFS;

  for (const result of results) {
    if (downloaded.length >= downloadLimit) break;

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

  // Detect image-heavy PDFs: average < 100 chars per page
  type OcrCandidate = { pdfPath: string; url: string; title: string };
  const ocrCandidates: OcrCandidate[] = [];
  const textPdfs: typeof pdfTexts = [];

  for (const pdf of pdfTexts) {
    const avgChars = pdf.pages.reduce((s, p) => s + p.text.length, 0) / Math.max(pdf.pages.length, 1);
    if (avgChars < 100) {
      log.info(`  [OCR] ${pdf.filename}: avg ${Math.round(avgChars)} chars/page — marking for OCR`);
      ocrCandidates.push({ pdfPath: pdf.pdfPath, url: pdf.url, title: pdf.title });
    } else {
      textPdfs.push(pdf);
    }
  }

  // Also add downloaded PDFs that had 0 relevant text pages (potential image-only PDFs)
  for (const dl of downloaded) {
    const fn = path.basename(dl.pdfPath);
    const alreadyQueued = ocrCandidates.some((o) => path.basename(o.pdfPath) === fn);
    const alreadyText = textPdfs.some((t) => t.filename === fn);
    if (!alreadyQueued && !alreadyText) {
      ocrCandidates.push(dl);
    }
  }

  const totalPages = textPdfs.reduce((n, p) => n + p.pages.length, 0);
  if (totalPages === 0 && ocrCandidates.length === 0) {
    log.error("No diagnostic pages found in any PDFs. Skipping this brand.");
    return 0;
  }

  if (totalPages > 0) {
    log.info(
      `Extracted text from ${totalPages} diagnostic pages across ${textPdfs.length} PDFs`
    );
  }
  if (ocrCandidates.length > 0) {
    log.info(`${ocrCandidates.length} PDF(s) queued for OCR fallback`);
  }

  // ─── PHASE 4: AI EXTRACTION ───
  log.step("\u{1F916}", "PHASE 4: Extracting fault codes with Gemini...");

  const brandRecord = await upsertBrand(brand);
  let grandTotal = 0;

  // Fetch existing manual names for consistency
  const existingManuals = await getPrisma().manual.findMany({
    where: { brandId: brandRecord.id },
    select: { name: true },
  });
  const existingNames = existingManuals.map((m) => m.name);

  for (const pdf of textPdfs) {
    if (shouldSkipManual(pdf.title)) {
      log.warn(
        `  [FILTER] Skipping PDF (out-of-scope keywords in title, no Gemini): ${pdf.title.slice(0, 80)}`
      );
      savings.skippedNoRelevance++;
      continue;
    }

    const manualName = sanitizeTitleLocal(
      await extractManualName(pdf.title, pdf.url, brand, existingNames)
    );
    // CONSUMER_ELECTRONICS_SKIP from Gemini plus shouldSkipManual on resolved name (industrial-filter).
    if (isConsumerSkipManualName(manualName)) {
      log.warn(
        `  Skipping out-of-scope (consumer / non-industrial) manual: ${pdf.title}`
      );
      savings.skippedNoRelevance++;
      continue;
    }
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
      let count = await extractAndSave(pdf.pages, manual.id, pdf.url, {
        brandName: brand,
        manualName,
      });

      // OCR fallback: if text extraction found nothing, try vision
      if (count === 0) {
        log.info(`  [OCR FALLBACK] Text extraction returned 0 codes, trying Gemini Vision...`);
        try {
          count = await extractWithOcr(pdf.pdfPath, manual.id, pdf.url, {
            brandName: brand,
            manualName,
          });
        } catch (ocrErr) {
          log.warn(`  [OCR FALLBACK] Failed: ${ocrErr instanceof Error ? ocrErr.message.substring(0, 150) : ocrErr}`);
        }
      }

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

  // ─── PHASE 5: OCR for image-heavy PDFs ───
  if (ocrCandidates.length > 0) {
    log.step("\u{1F4F7}", `PHASE 5: OCR extraction for ${ocrCandidates.length} image-based PDF(s)...`);

    for (const dl of ocrCandidates) {
      const fn = path.basename(dl.pdfPath);
      if (shouldSkipManual(dl.title)) {
        log.warn(
          `  [OCR] [FILTER] Skipping (out-of-scope keywords in title): ${dl.title.slice(0, 80)}`
        );
        savings.skippedNoRelevance++;
        continue;
      }

      const manualName = sanitizeTitleLocal(
        await extractManualName(dl.title, dl.url, brand, existingNames)
      );
      if (isConsumerSkipManualName(manualName)) {
        log.warn(
          `  [OCR] Skipping out-of-scope (consumer / blocklist keywords in name): ${dl.title}`
        );
        savings.skippedNoRelevance++;
        continue;
      }
      log.info(`[OCR] Processing: ${manualName}`);

      const manual = await upsertManual(brandRecord.id, manualName, dl.url);
      await createMiningLog({
        brand,
        manual: manualName,
        codesFound: 0,
        pagesUsed: 0,
        durationMs: 0,
        status: "started",
        message: "OCR vision-based extraction...",
      });

      const ocrStart = Date.now();
      try {
        const count = await extractWithOcr(dl.pdfPath, manual.id, dl.url, {
          brandName: brand,
          manualName,
        });
        grandTotal += count;
        const durMs = Date.now() - ocrStart;

        markCompleted(fn, dl.url, brand, count);
        await createMiningLog({
          brand,
          manual: manualName,
          codesFound: count,
          pagesUsed: 0,
          durationMs: durMs,
          status: count > 0 ? "success" : "empty",
          message: count > 0 ? `OCR extracted ${count} codes` : "OCR found no codes",
        });

        log.success(`  -> ${count} fault codes via OCR from ${manualName} (${(durMs / 1000).toFixed(1)}s)`);
      } catch (err) {
        const durMs = Date.now() - ocrStart;
        markFailed(fn, dl.url, brand);
        const errMsg = err instanceof Error ? err.message.substring(0, 200) : "Unknown error";
        await createMiningLog({
          brand,
          manual: manualName,
          codesFound: 0,
          pagesUsed: 0,
          durationMs: durMs,
          status: "failed",
          message: `OCR failed: ${errMsg}`,
        });
        log.error(`  [OCR] Failed: ${errMsg}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.success(
    `${brand} complete: ${grandTotal} codes from ${textPdfs.length + ocrCandidates.length} manuals in ${elapsed}s`
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
  maxRetries = 3,
  targetManuals?: string[],
  manualIds?: string[],
  shouldOverwrite = false
): Promise<number> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await mine(brand, force, savings, targetManuals, manualIds, shouldOverwrite);
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
  queueIds?: Map<string, string[]>,
  queueTargets?: Map<string, string[]>
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
    const queueIdGroup = queueIds?.get(brand) ?? [];
    const rawTargets = queueTargets?.get(brand);
    const parsedTargets = parseQueueTargets(rawTargets);
    const isForceRetry = parsedTargets.isForceRetry;
    const targets = isForceRetry ? undefined : parsedTargets.targetManuals;
    const isExpand = targets && targets.length > 0;
    const hasManualIds = parsedTargets.manualIds.length > 0;

    if (brands.length > 1) {
      log.banner(`BRAND ${i + 1}/${brands.length}: ${brand.toUpperCase()}`);
    }

    if (isForceRetry) {
      log.info(`[RETRY] Force re-mining "${brand}" (heavy mining mode)`);
    } else if (isExpand) {
      log.info(`[EXPAND] Targeted mining for: ${targets.join(", ")}`);
    }
    if (hasManualIds) {
      log.info(`[MANUAL RETRY] ${parsedTargets.manualIds.length} manual(s), overwrite=${parsedTargets.shouldOverwrite}`);
    }

    if (queueIdGroup.length > 0) {
      for (const queueId of queueIdGroup) {
        await setQueueStatus(queueId, "processing");
      }
      log.info(`Queue status -> processing`);
    }

    // Skip completed brands unless --force, targeted expand, or force retry
    if (!force && !isExpand && !isForceRetry && isBrandCompleted(brand)) {
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
      if (queueIdGroup.length > 0) {
        for (const queueId of queueIdGroup) {
          await deleteQueueItem(queueId);
        }
      }
      continue;
    }

    try {
      const count = await mineWithRetry(
        brand,
        force,
        savings,
        3,
        targets,
        parsedTargets.manualIds,
        parsedTargets.shouldOverwrite
      );
      totalCodes += count;
      results.push({
        brand,
        codes: count,
        status: count > 0 ? "OK" : "EMPTY",
      });

      if (isForceRetry && count === 0) {
        await createMiningLog({
          brand,
          manual: "(all cached – retry exhausted)",
          codesFound: 0,
          pagesUsed: 0,
          durationMs: 0,
          status: "skipped",
        });
      }

      if (count > 0) {
        try {
          await notifyUsersForBrand(brand);
        } catch (notifyErr) {
          log.warn(`[NOTIFY] Error: ${notifyErr}`);
        }

        try {
          await pingSitemap();
        } catch (pingErr) {
          log.warn(`[PING] Sitemap ping error: ${pingErr}`);
        }
      }

      if (queueIdGroup.length > 0) {
        for (const queueId of queueIdGroup) {
          await setQueueStatus(queueId, "completed");
        }
        log.info(`Queue status -> completed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Fatal error mining ${brand}: ${msg}`);
      results.push({ brand, codes: 0, status: "FAILED" });

      if (queueIdGroup.length > 0) {
        for (const queueId of queueIdGroup) {
          await setQueueStatus(queueId, "completed");
        }
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
  log.info("Site is live at: https://errorlib.net");
}

async function main() {
  const singleBrand = parseBrandArg();
  const force = hasForceFlag();
  const useQueue = hasQueueFlag();

  // ─── QUEUE MODE: Continuous loop pulling pending brands ───
  if (useQueue) {
    log.banner("QUEUE MINER (continuous)");
    log.info("Resetting stale queue items from previous runs...");
    await resetStaleQueueItems();
    log.info("Watching for new brands in the mining queue...");
    log.info("Add brands via the Admin Dashboard at /admin");
    log.info(`Poll interval: ${QUEUE_POLL_INTERVAL_MS / 1000}s`);
    log.info("Press Ctrl+C to stop.\n");

    while (true) {
      const queueItems = await fetchQueueBrands();

      if (queueItems.length === 0) {
        process.stdout.write(
          `\r  Waiting for queue items... (${new Date().toLocaleTimeString()})`
        );
        await sleep(QUEUE_POLL_INTERVAL_MS);
        continue;
      }

      process.stdout.write("\r" + " ".repeat(70) + "\r");

      const grouped = new Map<string, { ids: string[]; targetManuals: string[] }>();
      for (const q of queueItems) {
        const current = grouped.get(q.brandName) ?? { ids: [], targetManuals: [] };
        current.ids.push(q.id);
        current.targetManuals.push(...q.targetManuals);
        if (q.force) current.targetManuals.push("__FORCE_RETRY__");
        if (q.manualId) current.targetManuals.push(`__MANUAL_ID__:${q.manualId}`);
        if (q.force && q.manualId) current.targetManuals.push("__OVERWRITE__");
        grouped.set(q.brandName, current);
      }
      const brands = [...grouped.keys()];
      const queueIds = new Map([...grouped.entries()].map(([brandName, v]) => [brandName, v.ids]));
      const queueTargets = new Map(
        [...grouped.entries()]
          .filter(([, v]) => v.targetManuals.length > 0)
          .map(([brandName, v]) => [brandName, [...new Set(v.targetManuals)]])
      );

      log.info(`Found ${queueItems.length} pending brand(s): ${brands.join(", ")}`);
      if (queueTargets.size > 0) {
        log.info(`  ${queueTargets.size} brand(s) have targeted expansion series`);
      }
      await runBrandList(brands, force, queueIds, queueTargets);

      log.info("\nBatch complete. Watching for more queue items...\n");
      await sleep(COOLDOWN_BETWEEN_BRANDS_MS);
    }
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
