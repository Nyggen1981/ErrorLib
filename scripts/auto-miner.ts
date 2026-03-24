import "dotenv/config";
import path from "path";
import fs from "fs";
import { log } from "./lib/logger.js";
import { searchManuals, extractManualName } from "./lib/search.js";
import { downloadPdf, ensureTempDir } from "./lib/download.js";
import { extractDiagnosticPages } from "./lib/pdf-parser.js";
import { extractAndSave } from "./lib/extract.js";
import { upsertBrand, upsertManual, disconnect, getPrisma } from "./lib/db.js";

const MAX_PDFS = 5;
const MAX_PAGES_PER_PDF = 40;
const COOLDOWN_BETWEEN_BRANDS_MS = 10_000;

const AUTO_BRANDS = [
  "ABB",
  "Danfoss",
  "Siemens",
  "Schneider Electric",
  "Yaskawa",
];

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

async function mine(brand: string): Promise<number> {
  const startTime = Date.now();
  log.banner(`MINING RIG - ${brand.toUpperCase()}`);

  // ─── PHASE 1: SEARCH ───
  log.step("\u{1F310}", "PHASE 1: Searching for manuals...");
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

  // ─── PHASE 2: DOWNLOAD ───
  log.step("\u{2B07}\u{FE0F}", "PHASE 2: Downloading PDFs...");
  ensureTempDir();

  const downloaded: { pdfPath: string; url: string; title: string }[] = [];

  for (const result of results) {
    if (downloaded.length >= MAX_PDFS) break;

    const filename = `${brand.toLowerCase().replace(/\s+/g, "-")}_${downloaded.length + 1}.pdf`;
    const pdfPath = await downloadPdf(result.link, filename);
    if (pdfPath) {
      downloaded.push({
        pdfPath,
        url: result.link,
        title: result.title,
      });
    }
  }

  if (downloaded.length === 0) {
    log.error("Could not download any PDFs. Skipping this brand.");
    return 0;
  }

  log.info(`Downloaded ${downloaded.length} PDFs successfully`);

  // ─── PHASE 3: SCAN & CONVERT ───
  log.step("\u{1F9E0}", "PHASE 3: Scanning for diagnostic pages...");
  const imageDir = path.join(ensureTempDir(), "images");
  fs.mkdirSync(imageDir, { recursive: true });

  const pdfImages: {
    pdfPath: string;
    url: string;
    title: string;
    images: string[];
  }[] = [];

  for (const dl of downloaded) {
    const pages = await extractDiagnosticPages(
      dl.pdfPath,
      imageDir,
      MAX_PAGES_PER_PDF
    );
    if (pages.length > 0) {
      pdfImages.push({
        ...dl,
        images: pages.map((p) => p.imagePath),
      });
    }
  }

  const totalImages = pdfImages.reduce((n, p) => n + p.images.length, 0);
  if (totalImages === 0) {
    log.error("No diagnostic pages found in any PDFs. Skipping this brand.");
    return 0;
  }

  log.info(
    `Extracted ${totalImages} diagnostic page images from ${pdfImages.length} PDFs`
  );

  // ─── PHASE 4: AI EXTRACTION ───
  log.step("\u{1F916}", "PHASE 4: Extracting fault codes with Gemini...");

  const brandRecord = await upsertBrand(brand);
  let grandTotal = 0;

  for (const pdf of pdfImages) {
    const manualName = await extractManualName(pdf.title, pdf.url, brand);
    log.info(`Processing manual: ${manualName} (${pdf.images.length} pages)`);

    const manual = await upsertManual(brandRecord.id, manualName, pdf.url);
    const count = await extractAndSave(pdf.images, manual.id);
    grandTotal += count;

    if (count > 0) {
      console.log(
        `[LIVE UPDATE] Pushing ${count} codes to Neon for "${manualName}"...`
      );
    }

    log.success(`  -> ${count} fault codes extracted from ${manualName}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.success(
    `${brand} complete: ${grandTotal} codes from ${pdfImages.length} manuals in ${elapsed}s`
  );

  return grandTotal;
}

async function mineWithRetry(
  brand: string,
  maxRetries = 3
): Promise<number> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await mine(brand);
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

async function main() {
  const singleBrand = parseBrandArg();

  const brands =
    singleBrand !== null ? [singleBrand] : AUTO_BRANDS;

  if (brands.length === 0 || (brands.length === 1 && !brands[0])) {
    console.log(`
Usage:
  npm run mine -- --brand="ABB"       Mine a single brand
  npm run mine -- --all               Mine all 5 brands autonomously
  npm run mine                        Mine all 5 brands (default)

Brands in the auto queue: ${AUTO_BRANDS.join(", ")}
`);
    process.exit(1);
  }

  const globalStart = Date.now();
  let totalCodes = 0;
  const results: { brand: string; codes: number; status: string }[] = [];

  log.banner(
    brands.length === 1
      ? `MINING: ${brands[0]}`
      : `AUTONOMOUS MINING: ${brands.length} BRANDS`
  );

  if (brands.length > 1) {
    log.info(`Queue: ${brands.join(" -> ")}`);
    log.info("");
  }

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];

    if (brands.length > 1) {
      log.banner(`BRAND ${i + 1}/${brands.length}: ${brand.toUpperCase()}`);
    }

    try {
      const count = await mineWithRetry(brand);
      totalCodes += count;
      results.push({ brand, codes: count, status: count > 0 ? "OK" : "EMPTY" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Fatal error mining ${brand}: ${msg}`);
      results.push({ brand, codes: 0, status: "FAILED" });
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

  log.banner("AUTONOMOUS MINING COMPLETE");
  log.info("");
  log.info("Results per brand:");
  for (const r of results) {
    const icon =
      r.status === "OK" ? "\u2705" : r.status === "EMPTY" ? "\u26A0\uFE0F" : "\u274C";
    log.info(`  ${icon} ${r.brand.padEnd(22)} ${r.codes} codes  [${r.status}]`);
  }
  log.info("");
  log.success(`Total new codes:  ${totalCodes}`);
  log.success(`Time elapsed:     ${elapsed}s`);
  log.info("");
  log.info("Database totals:");
  log.info(`  Brands:      ${dbBrands}`);
  log.info(`  Manuals:     ${dbManuals}`);
  log.info(`  Fault codes: ${dbFaults}`);
  log.info("");
  log.info("Site is live at: https://error-lib.vercel.app");

  await disconnect();
}

main().catch(async (err) => {
  log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) log.detail(err.stack);
  await disconnect();
  process.exit(1);
});
