import fs from "fs";
import path from "path";
import { log } from "./logger.js";

const DIAGNOSTIC_KEYWORDS = [
  "fault",
  "fault code",
  "fault listing",
  "error code",
  "error listing",
  "alarm code",
  "alarm listing",
  "diagnostic",
  "diagnostics",
  "troubleshoot",
  "troubleshooting",
  "warning code",
  "warning listing",
  "trip code",
  "trip listing",
  "failure",
  "malfunction",
  "abnormal",
  "remedy",
  "corrective action",
  "possible cause",
  "cause and remedy",
  "fault trace",
];

type PageScanResult = {
  pageNumber: number;
  score: number;
  snippet: string;
};

export type RelevantPage = {
  pageNumber: number;
  imagePath: string;
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function scanPdfForDiagnosticPages(
  pdfPath: string
): Promise<PageScanResult[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const totalPages = doc.numPages;

  log.detail(`Scanning ${totalPages} pages for diagnostic content...`);

  const scoredPages: PageScanResult[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: Record<string, unknown>) =>
        "str" in item ? (item.str as string) : ""
      )
      .join(" ")
      .toLowerCase();

    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of DIAGNOSTIC_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = pageText.match(regex);
      if (matches) {
        score += matches.length;
        matchedKeywords.push(keyword);
      }
    }

    const faultCodePattern = /\b[FAEfae]\d{3,5}\b/g;
    const faultMatches = pageText.match(faultCodePattern);
    if (faultMatches) {
      score += faultMatches.length * 3;
    }

    const tablePattern = /\b(code|fault|alarm|error)\b.*\b(description|meaning|cause|remedy)\b/i;
    if (tablePattern.test(pageText)) {
      score += 10;
    }

    if (score >= 3) {
      const snippet = pageText.substring(0, 120).replace(/\s+/g, " ").trim();
      scoredPages.push({ pageNumber: i, score, snippet });
    }
  }

  await doc.destroy();

  scoredPages.sort((a, b) => b.score - a.score);
  return scoredPages;
}

export async function convertPageToImage(
  pdfPath: string,
  pageNumber: number,
  outputDir: string
): Promise<string> {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = await import("canvas");

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNumber);

  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // @ts-expect-error pdfjs RenderParameters type mismatch with node-canvas
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  await doc.destroy();

  const pdfName = path.basename(pdfPath, ".pdf");
  const imageName = `${pdfName}_page${pageNumber}.png`;
  const imagePath = path.join(outputDir, imageName);

  fs.mkdirSync(outputDir, { recursive: true });
  const pngBuffer = canvas.toBuffer("image/png");
  fs.writeFileSync(imagePath, pngBuffer);

  return imagePath;
}

export async function extractDiagnosticPages(
  pdfPath: string,
  outputDir: string,
  maxPages = 15
): Promise<RelevantPage[]> {
  const pdfName = path.basename(pdfPath);
  log.step("\u{1F50D}", `Scanning: ${pdfName}`);

  let scored: PageScanResult[];
  try {
    scored = await scanPdfForDiagnosticPages(pdfPath);
  } catch (err) {
    log.warn(`Could not parse ${pdfName}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  if (scored.length === 0) {
    log.warn(`No diagnostic pages found in ${pdfName}`);
    return [];
  }

  const topPages = scored.slice(0, maxPages);
  log.info(
    `Found ${scored.length} candidate pages, converting top ${topPages.length}`
  );

  const results: RelevantPage[] = [];

  for (const sp of topPages) {
    try {
      const imagePath = await convertPageToImage(
        pdfPath,
        sp.pageNumber,
        outputDir
      );
      results.push({ pageNumber: sp.pageNumber, imagePath });
      log.detail(
        `  Page ${sp.pageNumber} (score: ${sp.score}) -> ${path.basename(imagePath)}`
      );
    } catch (err) {
      log.warn(
        `  Failed to render page ${sp.pageNumber}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  return results;
}
