import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";
import { enqueueFaultCode, flushDbQueue, queueSize } from "./db.js";

export type ExtractedCode = {
  code: string;
  title: string;
  description: string;
  fixSteps: string[];
  sourcePage?: number;
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

const BATCH_PROMPT = `You are a senior industrial automation engineer extracting fault codes from equipment manual pages. Your audience is field technicians who need precise, actionable data — not generic advice.

Analyze ALL pages and extract EVERY unique fault code, error code, or alarm code.

For each code, return:
- "code": Exact alphanumeric fault code as printed (e.g. F0001, A0502, E016, 2310, FL1)
- "title": Short human-readable title (e.g. "Overcurrent", "DC Bus Overvoltage")
- "description": 2-4 sentences explaining the root cause, affected component, and risk. Include specific technical details: parameter numbers (e.g. "Parameter 99.06"), terminal names (e.g. "DI1", "X1:3"), and threshold values (e.g. "voltage >415V") when available in the source text.
- "fixSteps": Array of 3-6 specific troubleshooting steps ordered by priority.
- "sourcePage": The PDF page number where this fault code is primarily documented. Use the page number shown in the "--- Page X ---" header.

MANDATORY RULES FOR fixSteps:
1. Every step MUST reference something physically verifiable: a measurement, a parameter value, a terminal, a connection, a setting, or a DIP-switch position.
2. BANNED generic phrases (NEVER use these unless they are verbatim numbered steps from the manual):
   - "check wiring", "check connections", "inspect wiring"
   - "allow motor to cool", "allow to cool down"
   - "consult manufacturer", "refer to manual", "contact support"
   - "replace if necessary", "repair or replace"
   - "ensure proper ventilation"
3. GOOD step examples:
   - "Measure insulation resistance between motor phases U-V, V-W, U-W using a megger at 500VDC — expect >1 MΩ"
   - "Check parameter 30.01 (Motor Nominal Current) — verify it matches the motor nameplate FLA value"
   - "Measure DC bus voltage at terminals +UDC/-UDC — expect 540-750VDC for 400V input"
   - "Verify DI1 run command signal at terminal X1:1 — expect 24VDC when run is active"
4. If the manual lists specific parameter numbers, voltage/resistance values, or terminal designations for a fix, you MUST include them.
5. If the source text provides no actionable fix data for a code beyond generic advice, return fewer steps rather than padding with generics.

Strict filtering:
- Only extract ACTUAL fault/error/alarm codes. Ignore page numbers, chapter numbers, part numbers, or marketing text.
- Deduplicate: if the same code appears on multiple pages, merge all information into one entry.
- If a code has NEITHER description NOR fixSteps, discard it.
- If no fault codes exist in the text, return: { "codes": [] }
- Return ONLY valid JSON. No markdown fences, no commentary.

Output: { "codes": [{ "code": "...", "title": "...", "description": "...", "fixSteps": ["..."], "sourcePage": N }] }`;

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
      text: `${BATCH_PROMPT}\n\nThe attached PDF is an industrial equipment manual. Analyze every page and extract ALL fault/error/alarm codes you can find, including from tables and images. For "sourcePage", use the actual PDF page number where each fault code appears.`,
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

const PAGES_PER_SPLIT = 8;

async function splitPdf(
  pdfBytes: Buffer,
  pagesPerChunk: number
): Promise<Buffer[]> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();
  const chunks: Buffer[] = [];

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const newDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) newDoc.addPage(page);
    const bytes = await newDoc.save();
    chunks.push(Buffer.from(bytes));
  }

  return chunks;
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

  let allCodes: ExtractedCode[] = [];

  try {
    if (pdfBuffer.length <= MAX_PDF_BYTES_PER_CHUNK) {
      const result = await callGeminiPdf(pdfBuffer.toString("base64"));
      allCodes = result.codes;
    } else {
      const chunks = await splitPdf(pdfBuffer, PAGES_PER_SPLIT);
      log.info(
        `[PDF-OCR] Splitting large PDF (${sizeMB} MB) into ${chunks.length} chunks for processing`
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunkMB = (chunks[i].length / 1024 / 1024).toFixed(1);
        log.info(
          `[PDF-OCR] Chunk ${i + 1}/${chunks.length} (${chunkMB} MB)`
        );

        if (i > 0) {
          log.detail(
            `  [PDF-OCR] Rate-limit gap: flushing ${queueSize()} queued DB writes...`
          );
          const [flushed] = await Promise.all([
            flushDbQueue(),
            sleep(RATE_LIMIT_GAP_MS),
          ]);
          if (flushed > 0) {
            log.detail(`  [PDF-OCR] Flushed ${flushed} codes to Neon during wait`);
          }
        }

        try {
          const result = await callGeminiPdf(chunks[i].toString("base64"));
          if (result.codes.length > 0) {
            log.success(
              `  [PDF-OCR] Chunk ${i + 1}: ${result.codes.length} codes found`
            );
            allCodes.push(...result.codes);
          } else {
            log.detail(`  [PDF-OCR] Chunk ${i + 1}: no codes found`);
          }
        } catch (err) {
          log.warn(
            `  [PDF-OCR] Chunk ${i + 1} failed: ${err instanceof Error ? err.message.substring(0, 150) : err}`
          );
        }
      }
    }

    if (allCodes.length === 0) {
      log.detail(`[PDF-OCR] No fault codes found in ${filename}`);
      return 0;
    }

    log.success(
      `[PDF-OCR] Gemini found ${allCodes.length} codes in ${filename}`
    );

    const capped = filterAndCap(allCodes, MAX_CODES_PER_MANUAL);
    for (const fc of capped) {
      enqueueFaultCode({
        manualId,
        code: fc.code,
        title: fc.title,
        description: fc.description || `Fault ${fc.code}`,
        fixSteps: (fc.fixSteps || []).slice(0, 6),
        sourceUrl,
        sourcePage: fc.sourcePage,
      });
      log.detail(
        `    [PDF-OCR] ${fc.code} - ${fc.title}${fc.sourcePage ? ` (p.${fc.sourcePage})` : ""}`
      );
    }

    const saved = await flushDbQueue();
    if (saved > 0) log.success(`  [PDF-OCR] Pushed ${saved} codes to Neon`);
    return saved;
  } catch (err) {
    log.warn(
      `[PDF-OCR] Failed: ${err instanceof Error ? err.message.substring(0, 200) : err}`
    );
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

  for (const fc of capped) {
    enqueueFaultCode({
      manualId,
      code: fc.code,
      title: fc.title,
      description: fc.description || `Fault ${fc.code}`,
      fixSteps: (fc.fixSteps || []).slice(0, 6),
      sourceUrl,
      sourcePage: fc.sourcePage,
    });
    log.detail(`    ${fc.code} - ${fc.title}${fc.sourcePage ? ` (p.${fc.sourcePage})` : ""}`);
  }

  // Final flush for this manual
  const saved = await flushDbQueue();
  if (saved > 0) {
    log.success(`  Pushed ${saved} codes to Neon`);
  }

  return saved;
}
