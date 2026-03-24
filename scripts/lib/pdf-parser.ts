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
  text: string;
};

export type DiagnosticPage = {
  pageNumber: number;
  text: string;
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function extractDiagnosticText(
  pdfPath: string,
  maxPages = 40
): Promise<DiagnosticPage[]> {
  const pdfName = path.basename(pdfPath);
  log.step("\u{1F50D}", `Scanning: ${pdfName}`);

  const pdfjs = await loadPdfjs();
  let data: Uint8Array;
  try {
    data = new Uint8Array(fs.readFileSync(pdfPath));
  } catch (err) {
    log.warn(`Could not read ${pdfName}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  } catch (err) {
    log.warn(`Could not parse ${pdfName}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  const totalPages = doc.numPages;
  log.detail(`Scanning ${totalPages} pages for diagnostic content...`);

  const scoredPages: PageScanResult[] = [];

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

      if (score >= 3) {
        scoredPages.push({ pageNumber: i, score, text: pageText });
      }

      page.cleanup();
    } catch {
      // skip unreadable pages
    }
  }

  await doc.destroy();

  if (scoredPages.length === 0) {
    log.warn(`No diagnostic pages found in ${pdfName}`);
    return [];
  }

  scoredPages.sort((a, b) => b.score - a.score);
  const topPages = scoredPages.slice(0, maxPages);

  log.info(
    `Found ${scoredPages.length} candidate pages, using top ${topPages.length} (text-only, no canvas)`
  );

  for (const p of topPages.slice(0, 5)) {
    log.detail(`  Page ${p.pageNumber} (score: ${p.score})`);
  }
  if (topPages.length > 5) {
    log.detail(`  ... and ${topPages.length - 5} more`);
  }

  return topPages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
  }));
}
