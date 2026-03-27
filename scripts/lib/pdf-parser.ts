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

const HIGH_VALUE_KEYWORDS = [
  "fault",
  "error",
  "alarm",
  "code",
  "table",
  "troubleshooting",
];

type PageScanResult = {
  pageNumber: number;
  score: number;
  hvCount: number;
  text: string;
};

export type DiagnosticPage = {
  pageNumber: number;
  text: string;
};

export type DiagnosticResult = {
  pages: DiagnosticPage[];
  stats: {
    totalScanned: number;
    pagesKept: number;
    pagesFilteredLowRelevance: number;
  };
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

function countHighValueKeywords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of HIGH_VALUE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }
  const faultCodePattern = /\b[FAEfae]\d{3,5}\b/g;
  const faultMatches = lower.match(faultCodePattern);
  if (faultMatches) count += faultMatches.length;
  return count;
}

export async function extractDiagnosticText(
  pdfPath: string,
  maxPages = 40
): Promise<DiagnosticResult> {
  const pdfName = path.basename(pdfPath);
  log.step("\u{1F50D}", `Scanning: ${pdfName}`);

  const emptyResult: DiagnosticResult = {
    pages: [],
    stats: { totalScanned: 0, pagesKept: 0, pagesFilteredLowRelevance: 0 },
  };

  const pdfjs = await loadPdfjs();
  let data: Uint8Array;
  try {
    data = new Uint8Array(fs.readFileSync(pdfPath));
  } catch (err) {
    log.warn(`Could not read ${pdfName}: ${err instanceof Error ? err.message : err}`);
    return emptyResult;
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  } catch (err) {
    log.warn(`Could not parse ${pdfName}: ${err instanceof Error ? err.message : err}`);
    return emptyResult;
  }

  const totalPages = doc.numPages;
  log.detail(`Scanning ${totalPages} pages for diagnostic content...`);

  const scoredPages: PageScanResult[] = [];
  let lowRelevanceFiltered = 0;

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: Record<string, unknown>) =>
          "str" in item ? (item.str as string) : ""
        )
        .join(" ");

      const lower = pageText.toLowerCase();
      let score = 0;

      for (const keyword of DIAGNOSTIC_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        const matches = lower.match(regex);
        if (matches) score += matches.length;
      }

      const faultCodePattern = /\b[FAEfae]\d{3,5}\b/g;
      const faultMatches = lower.match(faultCodePattern);
      if (faultMatches) score += faultMatches.length * 3;

      const tablePattern =
        /\b(code|fault|alarm|error)\b.*\b(description|meaning|cause|remedy)\b/i;
      if (tablePattern.test(lower)) score += 10;

      const hvCount = countHighValueKeywords(pageText);

      if (score >= 3 && hvCount >= 3) {
        scoredPages.push({ pageNumber: i, score, hvCount, text: pageText });
      } else if (score >= 3) {
        lowRelevanceFiltered++;
      }

      page.cleanup();
    } catch {
      // skip unreadable pages
    }
  }

  await doc.destroy();

  if (scoredPages.length === 0) {
    log.warn(`No high-relevance diagnostic pages in ${pdfName}`);
    if (lowRelevanceFiltered > 0) {
      log.info(`  [SAVINGS] Filtered ${lowRelevanceFiltered} low-relevance pages (< 3 keyword hits)`);
    }
    return {
      pages: [],
      stats: {
        totalScanned: totalPages,
        pagesKept: 0,
        pagesFilteredLowRelevance: lowRelevanceFiltered,
      },
    };
  }

  scoredPages.sort((a, b) => b.score - a.score);
  const topPages = scoredPages.slice(0, maxPages);

  log.info(
    `Found ${scoredPages.length} high-relevance pages, using top ${topPages.length}`
  );
  if (lowRelevanceFiltered > 0) {
    log.info(`  [SAVINGS] Filtered ${lowRelevanceFiltered} low-relevance pages (< 3 keyword hits)`);
  }

  for (const p of topPages.slice(0, 5)) {
    log.detail(`  Page ${p.pageNumber} (score: ${p.score}, keywords: ${p.hvCount})`);
  }
  if (topPages.length > 5) {
    log.detail(`  ... and ${topPages.length - 5} more`);
  }

  return {
    pages: topPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    stats: {
      totalScanned: totalPages,
      pagesKept: topPages.length,
      pagesFilteredLowRelevance: lowRelevanceFiltered,
    },
  };
}
