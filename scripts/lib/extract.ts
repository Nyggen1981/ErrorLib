import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";
import { upsertFaultCode } from "./db.js";

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
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

      if (
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("Too Many Requests") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        const retryAfter = parseRetryDelay(msg) ?? 60 * (attempt + 1);
        if (attempt < maxRetries) {
          log.warn(
            `  Rate limited. Waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}...`
          );
          await sleep(retryAfter * 1000);
          continue;
        }
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

const MAX_CHARS_PER_REQUEST = 80_000;
const MAX_CODES_PER_MANUAL = 60;

export async function extractAndSave(
  pages: { pageNumber: number; text: string }[],
  manualId: string
): Promise<number> {
  const chunks: { pageNumber: number; text: string }[][] = [];
  let currentChunk: { pageNumber: number; text: string }[] = [];
  let currentLen = 0;

  for (const page of pages) {
    const pageLen = page.text.length + 30;
    if (currentLen + pageLen > MAX_CHARS_PER_REQUEST && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLen = 0;
    }
    currentChunk.push(page);
    currentLen += pageLen;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  let allCodes: ExtractedCode[] = [];

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const chunkText = chunk
      .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
      .join("\n\n");

    const label =
      chunks.length === 1
        ? `Sending ${chunk.length} pages to Gemini (text, ${(chunkText.length / 1000).toFixed(0)}k chars)...`
        : `Sending batch ${c + 1}/${chunks.length} (${chunk.length} pages, ${(chunkText.length / 1000).toFixed(0)}k chars) to Gemini...`;
    log.info(label);

    if (c > 0) {
      log.detail("  Waiting 30s between batches...");
      await sleep(30_000);
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
      `[LIVE UPDATE] Pushing ${capped.length} codes to Neon...`
    );
  }

  let totalCodes = 0;
  for (const fc of capped) {
    await upsertFaultCode(
      manualId,
      fc.code,
      fc.title,
      fc.description || `Fault ${fc.code}`,
      (fc.fixSteps || ["Refer to manufacturer documentation."]).slice(0, 5)
    );
    totalCodes++;
    log.detail(`    ${fc.code} - ${fc.title}`);
  }

  return totalCodes;
}
