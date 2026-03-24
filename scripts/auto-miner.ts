import "dotenv/config";
import path from "path";
import fs from "fs";
import { log } from "./lib/logger.js";
import { searchManuals, extractManualName } from "./lib/search.js";
import { downloadPdf, ensureTempDir, cleanTempDir } from "./lib/download.js";
import { extractDiagnosticPages } from "./lib/pdf-parser.js";
import { extractAndSave } from "./lib/extract.js";
import { upsertBrand, upsertManual, disconnect, getPrisma } from "./lib/db.js";

const MAX_PDFS = 5;
const MAX_PAGES_PER_PDF = 40;

function parseBrandArg(): string {
  const args = process.argv.slice(2);

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

  return "";
}

async function mine(brand: string) {
  const startTime = Date.now();
  log.banner(`MINING RIG - ${brand.toUpperCase()}`);

  // ─── PHASE 1: SEARCH ───
  log.step("\u{1F310}", "PHASE 1: Searching for manuals...");
  const results = await searchManuals(brand, 10);
  log.info(`Found ${results.length} PDF results from Google`);

  if (results.length === 0) {
    log.error("No PDF manuals found. Try a different brand name.");
    return;
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

    const filename = `${brand.toLowerCase()}_${downloaded.length + 1}.pdf`;
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
    log.error("Could not download any PDFs. Check the URLs above manually.");
    return;
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
    log.error("No diagnostic pages found in any of the downloaded PDFs.");
    return;
  }

  log.info(
    `Extracted ${totalImages} diagnostic page images from ${pdfImages.length} PDFs`
  );

  // ─── PHASE 4: AI EXTRACTION ───
  log.step("\u{1F916}", "PHASE 4: Extracting fault codes with AI Vision...");

  const brandRecord = await upsertBrand(brand);
  let grandTotal = 0;

  for (const pdf of pdfImages) {
    const manualName = await extractManualName(pdf.title, pdf.url, brand);
    log.info(`Processing manual: ${manualName} (${pdf.images.length} pages)`);

    const manual = await upsertManual(brandRecord.id, manualName, pdf.url);
    const count = await extractAndSave(pdf.images, manual.id);
    grandTotal += count;

    log.success(`  -> ${count} fault codes extracted from ${manualName}`);
  }

  // ─── SUMMARY ───
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const prisma = getPrisma();
  const totalBrands = await prisma.brand.count();
  const totalManuals = await prisma.manual.count();
  const totalFaults = await prisma.faultCode.count();

  log.banner("MINING COMPLETE");
  log.success(`Brand:        ${brand}`);
  log.success(`PDFs mined:   ${pdfImages.length}`);
  log.success(`Pages scanned: ${totalImages}`);
  log.success(`New codes:    ${grandTotal}`);
  log.success(`Time elapsed: ${elapsed}s`);
  log.info("");
  log.info(`Database totals:`);
  log.info(`  Brands:     ${totalBrands}`);
  log.info(`  Manuals:    ${totalManuals}`);
  log.info(`  Fault codes: ${totalFaults}`);
  log.info("");
  log.info(`Start the site with: npm run dev`);
  log.info(`View at: http://localhost:3000`);
}

async function main() {
  const brand = parseBrandArg();
  if (!brand) {
    console.log(`
Usage:
  npx tsx scripts/auto-miner.ts --brand="ABB"
  npx tsx scripts/auto-miner.ts --brand="Siemens"
  npx tsx scripts/auto-miner.ts "Danfoss"

Or via npm:
  npm run mine -- --brand="ABB"
`);
    process.exit(1);
  }

  try {
    await mine(brand);
  } catch (err) {
    log.error(
      `Fatal: ${err instanceof Error ? err.message : String(err)}`
    );
    if (err instanceof Error && err.stack) {
      log.detail(err.stack);
    }
    process.exit(1);
  } finally {
    await disconnect();
  }
}

main();
