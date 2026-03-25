import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";
import { enqueueFaultCode, flushDbQueue, queueSize } from "./db.js";

export type ExtractedCode = {
  code: string;
  title: string;
  description: string;
  fixSteps: string[];
};

export type ExtractionResult = {
  codes: ExtractedCode[];
};

let _genAI: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in .env");
    }
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

export async function preflight(): Promise<boolean> {
  try {
    const genAI = getGemini();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Reply with only the word OK");
    const text = result.response.text().trim();
    return text.length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
      return false;
    }
    throw err;
  }
}

const BATCH_PROMPT = `You are a senior industrial automation engineer analyzing extracted text from pages of an equipment manual.

You are receiving text content from multiple pages of the SAME manual. Analyze ALL pages together and extract EVERY unique fault code, error code, or alarm code.

For each unique code found, return:
- "code": The exact alphanumeric fault code as printed (e.g. F0001, A0502, E016, 2310, FL1)
- "title": A short human-readable title (e.g. "Overcurrent", "DC Bus Overvoltage")
- "description": A detailed 2-4 sentence explanation of what causes this fault, what component is affected, and the risk if left unresolved. Write this for a field technician who needs to understand the problem quickly.
- "fixSteps": An array of 3-5 specific, actionable troubleshooting steps in order of priority. Each step should be something a technician can physically do on-site (e.g. "Measure insulation resistance between motor phases and earth using a megger — expect >1 MΩ"). Combine redundant steps into high-impact bullet points.

Strict filtering rules:
- Only extract ACTUAL technical fault/error/alarm codes (e.g. F0016, AL32, E005, 2310). Ignore page numbers, chapter numbers, index entries, part numbers, or marketing text.
- Deduplicate: if the same code appears on multiple pages, merge the information into one entry.
- If a code is missing BOTH a description AND fixSteps, discard it entirely.
- If none of the pages contain any fault codes, return: { "codes": [] }
- Return ONLY valid JSON. No markdown fences, no commentary, no explanation outside the JSON.

Output format: { "codes": [{ "code": "...", "title": "...", "description": "...", "fixSteps": ["...", "..."] }] }`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelay(errorMsg: string): number | null {
  const match = errorMsg.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.ceil(parseFloat(match[1]));
  const retryDelayMatch = errorMsg.match(/"retryDelay":"(\d+)s"/);
  if (retryDelayMatch) return parseInt(retryDelayMatch[1]);
  return null;
}

async function callGeminiText(
  pagesText: string,
  maxRetries = 5
): Promise<ExtractionResult> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${BATCH_PROMPT}\n\n--- MANUAL TEXT START ---\n${pagesText}\n--- MANUAL TEXT END ---`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(cleaned) as ExtractionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      const isRateLimit =
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("Too Many Requests") ||
        msg.includes("RESOURCE_EXHAUSTED");

      const isTransient =
        msg.includes("503") ||
        msg.includes("Service Unavailable") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("currently experiencing") ||
        msg.includes("overloaded");

      if ((isRateLimit || isTransient) && attempt < maxRetries) {
        const retryAfter = isRateLimit
          ? (parseRetryDelay(msg) ?? 60 * (attempt + 1))
          : 30 * (attempt + 1);
        const reason = isRateLimit ? "Rate limited" : "Service unavailable (503)";
        const queued = queueSize();
        if (queued > 0) {
          log.warn(
            `  ${reason}. Flushing ${queued} queued DB writes while waiting ${retryAfter}s (retry ${attempt + 1}/${maxRetries})...`
          );
        } else {
          log.warn(
            `  ${reason}. Waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}...`
          );
        }
        const [flushed] = await Promise.all([
          flushDbQueue(),
          sleep(retryAfter * 1000),
        ]);
        if (flushed > 0) {
          log.detail(`  Flushed ${flushed} codes to Neon during wait`);
        }
        continue;
      }

      throw err;
    }
  }

  return { codes: [] };
}

function filterAndCap(codes: ExtractedCode[], max: number): ExtractedCode[] {
  const valid = codes.filter((fc) => {
    if (!fc.code || !fc.title) return false;
    const hasDesc = fc.description && fc.description.length > 5;
    const hasSteps = Array.isArray(fc.fixSteps) && fc.fixSteps.length > 0;
    return hasDesc || hasSteps;
  });

  if (valid.length <= max) return valid;

  log.warn(
    `  Gemini returned ${valid.length} codes, capping to top ${max}`
  );
  return valid.slice(0, max);
}

function buildChunkText(
  chunk: { pageNumber: number; text: string }[]
): string {
  return chunk
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
    .join("\n\n");
}

const MAX_CHARS_PER_REQUEST = 20_000;
const MAX_PAGES_PER_CHUNK = 20;
const MAX_CODES_PER_MANUAL = 60;
const RATE_LIMIT_GAP_MS = 35_000;

const MAX_PDF_BYTES_PER_CHUNK = 15 * 1024 * 1024;

async function callGeminiPdf(
  pdfBase64: string,
  maxRetries = 3
): Promise<ExtractionResult> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const parts = [
    {
      text: `${BATCH_PROMPT}\n\nThe attached PDF is an industrial equipment manual. Analyze every page and extract ALL fault/error/alarm codes you can find, including from tables and images.`,
    },
    {
      inlineData: {
        data: pdfBase64,
        mimeType: "application/pdf",
      },
    },
  ];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(parts);
      const raw = result.response.text().trim();
      const cleaned = raw
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(cleaned) as ExtractionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("429") || msg.includes("503") ||
        msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") || msg.includes("overloaded");

      if (isRetryable && attempt < maxRetries) {
        const wait = 30 * (attempt + 1);
        log.warn(`  [PDF-OCR] ${msg.substring(0, 80)} — retrying in ${wait}s (${attempt + 1}/${maxRetries})`);
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  return { codes: [] };
}

export async function extractWithOcr(
  pdfPath: string,
  manualId: string,
  sourceUrl?: string
): Promise<number> {
  const filename = path.basename(pdfPath);
  log.info(`[PDF-OCR] Sending raw PDF to Gemini: ${filename}`);

  const pdfBuffer = fs.readFileSync(pdfPath);
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  log.info(`[PDF-OCR] File size: ${sizeMB} MB`);

  if (pdfBuffer.length > MAX_PDF_BYTES_PER_CHUNK) {
    log.warn(`[PDF-OCR] PDF is too large (${sizeMB} MB > 15 MB limit). Skipping.`);
    return 0;
  }

  const pdfBase64 = pdfBuffer.toString("base64");

  try {
    const result = await callGeminiPdf(pdfBase64);

    if (result.codes.length === 0) {
      log.detail(`[PDF-OCR] No fault codes found in ${filename}`);
      return 0;
    }

    log.success(`[PDF-OCR] Gemini found ${result.codes.length} codes in ${filename}`);

    const capped = filterAndCap(result.codes, MAX_CODES_PER_MANUAL);
    for (const fc of capped) {
      enqueueFaultCode({
        manualId,
        code: fc.code,
        title: fc.title,
        description: fc.description || `Fault ${fc.code}`,
        fixSteps: (fc.fixSteps || ["Refer to manufacturer documentation."]).slice(0, 5),
        sourceUrl,
      });
      log.detail(`    [PDF-OCR] ${fc.code} - ${fc.title}`);
    }

    const saved = await flushDbQueue();
    if (saved > 0) log.success(`  [PDF-OCR] Pushed ${saved} codes to Neon`);
    return saved;
  } catch (err) {
    log.warn(`[PDF-OCR] Failed: ${err instanceof Error ? err.message.substring(0, 200) : err}`);
    return 0;
  }
}

export async function extractAndSave(
  pages: { pageNumber: number; text: string }[],
  manualId: string,
  sourceUrl?: string
): Promise<number> {
  const chunks: { pageNumber: number; text: string }[][] = [];
  let currentChunk: { pageNumber: number; text: string }[] = [];
  let currentLen = 0;

  for (const page of pages) {
    const pageLen = page.text.length + 30;
    const chunkFull =
      (currentLen + pageLen > MAX_CHARS_PER_REQUEST || currentChunk.length >= MAX_PAGES_PER_CHUNK) &&
      currentChunk.length > 0;

    if (chunkFull) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLen = 0;
    }
    currentChunk.push(page);
    currentLen += pageLen;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  let allCodes: ExtractedCode[] = [];

  // Async pipeline: overlap Gemini wait + DB writes
  // While waiting the 30s rate-limit gap, flush queued DB writes
  let pendingDbFlush: Promise<number> | null = null;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const chunkText = buildChunkText(chunk);

    const label =
      chunks.length === 1
        ? `Sending ${chunk.length} pages to Gemini (${(chunkText.length / 1000).toFixed(0)}k chars)...`
        : `Batch ${c + 1}/${chunks.length} (${chunk.length} pages, ${(chunkText.length / 1000).toFixed(0)}k chars)...`;
    log.info(label);

    if (c > 0) {
      // Use the 30s rate-limit gap to flush any queued DB writes
      log.detail(`  Rate-limit gap: flushing ${queueSize()} queued DB writes...`);
      pendingDbFlush = flushDbQueue();
      const flushAndWait = Promise.all([
        pendingDbFlush,
        sleep(RATE_LIMIT_GAP_MS),
      ]);
      const [flushed] = await flushAndWait;
      if (flushed > 0) {
        log.detail(`  Flushed ${flushed} codes to Neon during wait`);
      }
      pendingDbFlush = null;
    }

    try {
      const result = await callGeminiText(chunkText);

      if (result.codes.length === 0) {
        log.detail("  No fault codes found in this batch");
        continue;
      }

      log.success(`  Gemini returned ${result.codes.length} fault codes`);
      allCodes.push(...result.codes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Batch extraction failed: ${msg.substring(0, 200)}`);
    }
  }

  const capped = filterAndCap(allCodes, MAX_CODES_PER_MANUAL);

  if (capped.length > 0) {
    console.log(
      `[LIVE UPDATE] Queuing ${capped.length} codes for Neon push...`
    );
  }

  // Enqueue all codes for background DB write
  for (const fc of capped) {
    enqueueFaultCode({
      manualId,
      code: fc.code,
      title: fc.title,
      description: fc.description || `Fault ${fc.code}`,
      fixSteps: (fc.fixSteps || ["Refer to manufacturer documentation."]).slice(
        0,
        5
      ),
      sourceUrl,
    });
    log.detail(`    ${fc.code} - ${fc.title}`);
  }

  // Final flush for this manual
  const saved = await flushDbQueue();
  if (saved > 0) {
    log.success(`  Pushed ${saved} codes to Neon`);
  }

  return saved;
}
