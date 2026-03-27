import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";
import { enqueueFaultCode, flushDbQueue, queueSize, slugify } from "./db.js";

export { washManualTitle, sanitizeTitle } from "../../src/lib/manual-title-wash.js";

export type ExtractedCode = {
  code: string;
  title: string;
  description: string;
  causes: string[];
  fixSteps: string[];
  sourcePage?: number;
};

type ExtractionContext = {
  brandName: string;
  manualName: string;
};

type CategoryConfidence = "high" | "low";

type CategorySlug =
  | "general"
  | "electrical"
  | "communication"
  | "mechanical"
  | "thermal"
  | "configuration"
  | "software"
  | "safety";

const CATEGORY_SLUGS: CategorySlug[] = [
  "general",
  "electrical",
  "communication",
  "mechanical",
  "thermal",
  "configuration",
  "software",
  "safety",
];

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

/** Scope gate for all fault-code extraction (text + PDF) in the miner */
const INDUSTRIAL_SCOPE_SYSTEM_INSTRUCTION = `You must ONLY process manuals that belong to industrial automation, electrical engineering, energy systems, or mechanical / machine engineering — for example PLCs, VFDs/servo drives, industrial robots, CNC controls, process automation, industrial HMIs, fieldbuses, industrial switchgear, and similar equipment used in plants, factories, utilities, or machine building.

If the document is clearly consumer electronics or unrelated consumer products — including but not limited to blood pressure monitors, domestic coffee machines, toys, home appliances, consumer audio/video, fitness wearables, or general household gadgets — you must NOT extract any fault codes. In that case respond with exactly this JSON and nothing else:
{"codes":[]}

When you identify a product series or model family (in titles, descriptions, causes, or fix steps), be extremely specific about the exact letter-and-number designation of the product line.

DO refer to lines like: "PowerFlex 750", "S7-300", "V1000".

DO NOT use vague product buckets as if they were a series name, e.g. "AC Drives", "Inverter", or "Manual".

If a manual covers more than one series (e.g. SINAMICS S120 and S150), name both, separated by a slash, e.g. "S120/S150".

No markdown fences, no commentary, no other keys.`;

function getExtractionModel() {
  return getGemini().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: INDUSTRIAL_SCOPE_SYSTEM_INSTRUCTION,
  });
}

function parseExtractionResponse(raw: string): ExtractionResult {
  const cleaned = raw
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as ExtractionResult).codes)) {
      return { codes: (parsed as ExtractionResult).codes };
    }
  } catch {
    /* ignore */
  }
  return { codes: [] };
}

export async function preflight(): Promise<boolean> {
  try {
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
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

function buildBatchPrompt(context?: ExtractionContext): string {
  const contextBlock = context
    ? `TECHNICAL CONTEXT:
- Brand: ${context.brandName}
- Manual: ${context.manualName}

You are a senior service engineer. If the source text lacks specific repair steps for ${context.brandName} [CODE], use your internal technical knowledge to generate 3-5 logical, professional troubleshooting steps based on the fault description.
`
    : "";

  return `You are a senior industrial automation engineer extracting fault codes from equipment manual pages. Your audience is field technicians who need precise, actionable data — not generic advice.

${contextBlock}

Analyze ALL pages and extract EVERY unique fault code, error code, or alarm code.

For each code, return:
- "code": Exact alphanumeric fault code as printed (e.g. F0001, A0502, E016, 2310, FL1)
- "title": Short human-readable title (e.g. "Overcurrent", "DC Bus Overvoltage")
- "description": 2-4 sentences explaining the root cause, affected component, and risk. Include specific technical details: parameter numbers (e.g. "Parameter 99.06"), terminal names (e.g. "DI1", "X1:3"), and threshold values (e.g. "voltage >415V") when available in the source text.
- "causes": Array of 3-5 strings explaining WHY this fault typically occurs (e.g. "Motor cable insulation breakdown due to aging or mechanical damage", "Supply voltage sag below 340V during heavy load transients"). Be specific to this equipment, not generic. Include parameter numbers where relevant (e.g. "Parameter P1-54 set below motor rated torque").
- "fixSteps": Array of 3-6 troubleshooting steps ordered by priority (MANDATORY — see below).
- "sourcePage": The PDF page number where this fault code is primarily documented. Use the page number shown in the "--- Page X ---" header.

MANDATORY FIELD — fixSteps (never empty):
- You MUST return a non-empty "fixSteps" array for every code: minimum 3 items, target 3-6. Never output [] or omit fixSteps.
- If the manual lists explicit numbered troubleshooting steps, use and adapt them. If explicit steps are missing or incomplete, derive logical diagnostic steps from the "causes" you listed for that same code — each step should map to verifying or ruling out those causes.
- Safety first: prioritize non-destructive checks a field technician can perform: verify wiring and terminations, measure voltage/current at defined points, check and compare drive/controller parameters against the manual or nameplate, inspect for mechanical blockage or binding, test motor or cable insulation where applicable. Use professional, active phrasing: "Verify...", "Inspect...", "Measure...", "Test...".
- Do not guess internal component-level repairs (e.g. replacing a specific PCB or semiconductor) unless the source text explicitly instructs it. Focus on what can be checked externally, by measurement, or through the controller/HMI/parameter interface.
- Consistency: if a cause involves overcurrent or short-circuit risk, include a step such as: "Check motor windings and power cables for short circuits or ground faults using appropriate continuity and insulation tests." If causes mention incorrect parameters, include verifying those parameters against nameplate and application data.
- Every step MUST still name something verifiable: a measurement, parameter, terminal, connection, setting, or DIP-switch position when the manual provides them. If the manual gives specific parameter numbers, voltages, resistances, or terminal IDs for a fix, you MUST include them in the relevant steps.
- Avoid hollow placeholders as the only content: do not use "consult manufacturer", "refer to manual", "contact support", or "replace if necessary" as standalone steps. Do not use "allow motor to cool" as the sole step unless the manual states it as the primary remedy.
- GOOD step examples:
   - "Measure insulation resistance between motor phases U-V, V-W, U-W with a megger at 500VDC — expect >1 MΩ"
   - "Verify parameter 30.01 (Motor Nominal Current) matches the motor nameplate FLA"
   - "Measure DC bus voltage at +UDC/-UDC — expect 540-750VDC for 400V class supply"
   - "Verify run command at DI1 / terminal X1:1 — expect 24VDC when run is active"

TEXT FORMATTING RULES (apply to ALL string fields):
1. Parameters: Write as a single unbroken token — "P1-54" NOT "P1 -54" or "P1- 54". No spaces between prefix, hyphen, and number.
2. Parentheses: Every opening ( MUST have a closing ). Never leave dangling parentheses. Use parentheses ONLY for short technical references like "(Brake torque)" or "(24VDC)". Do NOT wrap entire sentences in parentheses.
3. No double spaces. No leading/trailing whitespace in array items.
4. Do NOT use markdown bold (**) in any field — we handle formatting in the UI.

Strict filtering:
- Only extract ACTUAL fault/error/alarm codes. Ignore page numbers, chapter numbers, part numbers, or marketing text.
- Deduplicate: if the same code appears on multiple pages, merge all information into one entry.
- Discard any code that is missing "fixSteps" or has an empty fixSteps array.
- If no fault codes exist in the text, return: { "codes": [] }
- Return ONLY valid JSON. No markdown fences, no commentary.

Output: { "codes": [{ "code": "...", "title": "...", "description": "...", "causes": ["..."], "fixSteps": ["..."], "sourcePage": N }] }`;
}

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

function normalizeText(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeList(items: string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => normalizeText(s))
    .filter(Boolean);
}

function categorizeDescription(description: string): {
  slug: CategorySlug;
  confidence: CategoryConfidence;
} {
  const d = description.toLowerCase();
  if (/\b(voltage|current|power|phase|overvoltage|undervoltage|short|ground fault)\b/i.test(d)) {
    return { slug: "electrical", confidence: "high" };
  }
  if (/\b(comm|communication|bus|link|network|fieldbus|ethernet|can|profibus|modbus)\b/i.test(d)) {
    return { slug: "communication", confidence: "high" };
  }
  if (/\b(temp|thermal|overheat|heatsink|fan)\b/i.test(d)) {
    return { slug: "thermal", confidence: "high" };
  }
  if (/\b(parameter|setting|configuration|calibration)\b/i.test(d)) {
    return { slug: "configuration", confidence: "high" };
  }
  if (/\b(software|firmware|checksum|watchdog|program|memory)\b/i.test(d)) {
    return { slug: "software", confidence: "high" };
  }
  if (/\b(safety|sto|guard|interlock|estop|emergency stop)\b/i.test(d)) {
    return { slug: "safety", confidence: "high" };
  }
  if (/\b(mechanical|bearing|shaft|jam|stuck|vibration|brake)\b/i.test(d)) {
    return { slug: "mechanical", confidence: "high" };
  }
  return { slug: "general", confidence: "low" };
}

function parseCategorySlug(raw: string): CategorySlug | null {
  const val = raw.trim().toLowerCase();
  return CATEGORY_SLUGS.includes(val as CategorySlug) ? (val as CategorySlug) : null;
}

async function resolveCategoryWithLlm(
  description: string,
  context?: ExtractionContext
): Promise<CategorySlug> {
  const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(
    `Pick exactly one category slug for this industrial fault description.\nAllowed slugs: ${CATEGORY_SLUGS.join(", ")}.\nReturn ONLY the slug string, nothing else.\n\nBrand: ${context?.brandName ?? "unknown"}\nManual: ${context?.manualName ?? "unknown"}\nDescription: ${description}`
  );
  const raw = result.response.text();
  const parsed = parseCategorySlug(raw);
  return parsed ?? "general";
}

async function enhanceFixStepsIfNeeded(
  fc: ExtractedCode,
  context?: ExtractionContext
): Promise<string[]> {
  const cleaned = normalizeList(fc.fixSteps);
  if (cleaned.length >= 2) return cleaned.slice(0, 6);
  log.warn(
    `    [ENHANCE] ${fc.code}: fixSteps too short (${cleaned.length}), requesting enhancement prompt`
  );
  try {
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are a senior service engineer.\nKontekst: Feilkode: ${fc.code}, Navn: ${fc.title}, Beskrivelse: ${fc.description}, Utstyr: ${context?.brandName ?? "unknown"} ${context?.manualName ?? "unknown"}.\nIf the source text lacks specific repair steps for ${context?.brandName ?? "the equipment"} ${fc.code}, use your internal technical knowledge to generate 3-5 logical, professional troubleshooting steps based on the fault description.\nSafety: prioritize non-destructive checks (verify wiring, measure voltage/current, check parameters, inspect mechanical blockage, insulation checks where relevant). Do not guess internal component repair.\nReturn ONLY valid JSON array of strings.`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const arr = parsed
        .filter((x) => typeof x === "string")
        .map((s) => normalizeText(s))
        .filter(Boolean);
      if (arr.length >= 2) return arr.slice(0, 6);
    }
  } catch {
    /* keep original if enhancement fails */
  }
  log.warn(
    `    [ENHANCE] ${fc.code}: enhancement failed or still insufficient fixSteps`
  );
  return cleaned.slice(0, 6);
}

async function validateExtractedCodes(
  codes: ExtractedCode[],
  manualId: string,
  context?: ExtractionContext
): Promise<ExtractedCode[]> {
  const validated: ExtractedCode[] = [];
  for (const code of codes) {
    const normalized: ExtractedCode = {
      code: normalizeText(code.code),
      title: normalizeText(code.title),
      description: normalizeText(code.description),
      causes: normalizeList(code.causes),
      fixSteps: normalizeList(code.fixSteps),
      sourcePage: code.sourcePage,
    };

    if (!normalized.code || !normalized.title) continue;
    normalized.fixSteps = await enhanceFixStepsIfNeeded(normalized, context);
    if (normalized.fixSteps.length < 2) continue;

    const baseCategory = categorizeDescription(normalized.description);
    let categorySlug = baseCategory.slug;
    if (baseCategory.confidence === "low") {
      try {
        categorySlug = await resolveCategoryWithLlm(normalized.description, context);
      } catch {
        categorySlug = baseCategory.slug;
      }
    }
    log.detail(
      `    [CAT] ${normalized.code} -> ${categorySlug}${baseCategory.confidence === "low" ? " (llm)" : ""}`
    );

    // Final Prisma-aligned shape check (slug generated in DB layer from code+title+manual).
    void manualId;
    validated.push(normalized);
  }
  return validated;
}

async function callGeminiText(
  pagesText: string,
  context?: ExtractionContext,
  maxRetries = 5
): Promise<ExtractionResult> {
  const model = getExtractionModel();

  const prompt = `${buildBatchPrompt(context)}\n\n--- MANUAL TEXT START ---\n${pagesText}\n--- MANUAL TEXT END ---`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      return parseExtractionResponse(raw);
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
    if (!hasSteps) return false;
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

/** After this many consecutive 0-code chunks, stop scanning the rest (saves time on huge PDFs). 0 = never stop early. */
function getOcrConsecutiveEmptyChunkLimit(): number {
  const raw = process.env.PDF_OCR_MAX_CONSECUTIVE_EMPTY_CHUNKS;
  if (raw === undefined || raw === "") return 15;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 15;
  return n;
}

async function callGeminiPdf(
  pdfBase64: string,
  context?: ExtractionContext,
  maxRetries = 3
): Promise<ExtractionResult> {
  const model = getExtractionModel();

  const parts = [
    {
      text: `${buildBatchPrompt(context)}\n\nThe attached PDF is an industrial equipment manual. Analyze every page and extract ALL fault/error/alarm codes you can find, including from tables and images. For "sourcePage", use the actual PDF page number where each fault code appears.`,
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
      return parseExtractionResponse(raw);
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
  sourceUrl?: string,
  context?: ExtractionContext
): Promise<number> {
  const filename = path.basename(pdfPath);
  log.info(`[PDF-OCR] Sending raw PDF to Gemini: ${filename}`);

  const pdfBuffer = fs.readFileSync(pdfPath);
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  log.info(`[PDF-OCR] File size: ${sizeMB} MB`);

  let allCodes: ExtractedCode[] = [];

  try {
    if (pdfBuffer.length <= MAX_PDF_BYTES_PER_CHUNK) {
      const result = await callGeminiPdf(pdfBuffer.toString("base64"), context);
      allCodes = result.codes;
    } else {
      const chunks = await splitPdf(pdfBuffer, PAGES_PER_SPLIT);
      log.info(
        `[PDF-OCR] Splitting large PDF (${sizeMB} MB) into ${chunks.length} chunks for processing`
      );

      const emptyStreakLimit = getOcrConsecutiveEmptyChunkLimit();
      let consecutiveEmptyChunks = 0;

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
          const result = await callGeminiPdf(chunks[i].toString("base64"), context);
          if (result.codes.length > 0) {
            consecutiveEmptyChunks = 0;
            log.success(
              `  [PDF-OCR] Chunk ${i + 1}: ${result.codes.length} codes found`
            );
            allCodes.push(...result.codes);
          } else {
            consecutiveEmptyChunks++;
            log.detail(`  [PDF-OCR] Chunk ${i + 1}: no codes found`);
            if (
              emptyStreakLimit > 0 &&
              consecutiveEmptyChunks >= emptyStreakLimit
            ) {
              const skipped = chunks.length - i - 1;
              log.warn(
                `  [PDF-OCR] Stopping early after ${emptyStreakLimit} consecutive chunks with no codes (${skipped} chunk(s) not scanned). Set PDF_OCR_MAX_CONSECUTIVE_EMPTY_CHUNKS=0 to scan the whole PDF.`
              );
              break;
            }
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
    const validated = await validateExtractedCodes(capped, manualId, context);
    for (const fc of validated) {
      enqueueFaultCode({
        manualId,
        code: fc.code,
        slug: slugify(`${fc.code}-${fc.title}`),
        title: fc.title,
        description: fc.description || `Fault ${fc.code}`,
        fixSteps: (fc.fixSteps || []).slice(0, 6),
        causes: fc.causes || [],
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
  sourceUrl?: string,
  context?: ExtractionContext
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
      const result = await callGeminiText(chunkText, context);

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
  const validated = await validateExtractedCodes(capped, manualId, context);

  if (validated.length > 0) {
    console.log(
      `[LIVE UPDATE] Queuing ${validated.length} codes for Neon push...`
    );
  }

  for (const fc of validated) {
    enqueueFaultCode({
      manualId,
      code: fc.code,
      slug: slugify(`${fc.code}-${fc.title}`),
      title: fc.title,
      description: fc.description || `Fault ${fc.code}`,
      fixSteps: (fc.fixSteps || []).slice(0, 6),
      causes: fc.causes || [],
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
