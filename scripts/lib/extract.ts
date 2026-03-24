import fs from "fs";
import path from "path";
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

const BATCH_PROMPT = `You are a senior industrial automation engineer analyzing pages from an equipment manual.

You are receiving multiple page images from the SAME manual. Analyze ALL pages together and extract EVERY unique fault code, error code, or alarm code across all pages.

For each unique code found, return:
- "code": The exact alphanumeric fault code as printed (e.g. F0001, A0502, E016, 2310, FL1)
- "title": A short human-readable title (e.g. "Overcurrent", "DC Bus Overvoltage")
- "description": A detailed 2-4 sentence explanation of what causes this fault, what component is affected, and the risk if left unresolved. Write this for a field technician who needs to understand the problem quickly.
- "fixSteps": An array of 3-6 specific, actionable troubleshooting steps in order of priority. Each step should be something a technician can physically do on-site (e.g. "Measure insulation resistance between motor phases and earth using a megger — expect >1 MΩ").

Rules:
- Extract ALL unique codes across every page, even if there are hundreds.
- Deduplicate: if the same code appears on multiple pages, merge the information into one entry.
- If a page contains a table of codes, extract every row.
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

function buildImagePart(imagePath: string) {
  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  return { inlineData: { mimeType, data: buffer.toString("base64") } };
}

async function callGeminiBatch(
  imagePaths: string[],
  maxRetries = 3
): Promise<ExtractionResult> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const parts: Parameters<typeof model.generateContent>[0] = [
    BATCH_PROMPT,
    ...imagePaths.map(buildImagePart),
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

      if (
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("Too Many Requests")
      ) {
        const retryAfter = parseRetryDelay(msg) ?? 30 * (attempt + 1);
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

const MAX_IMAGES_PER_REQUEST = 40;

export async function extractAndSave(
  imagePaths: string[],
  manualId: string
): Promise<number> {
  let totalCodes = 0;

  const chunks: string[][] = [];
  for (let i = 0; i < imagePaths.length; i += MAX_IMAGES_PER_REQUEST) {
    chunks.push(imagePaths.slice(i, i + MAX_IMAGES_PER_REQUEST));
  }

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const label =
      chunks.length === 1
        ? `Sending ${chunk.length} pages to Gemini in one request...`
        : `Sending batch ${c + 1}/${chunks.length} (${chunk.length} pages) to Gemini...`;
    log.info(label);

    if (c > 0) {
      log.detail("  Waiting 5s between batches...");
      await sleep(5000);
    }

    try {
      const result = await callGeminiBatch(chunk);

      if (result.codes.length === 0) {
        log.detail("  No fault codes found in this batch");
        continue;
      }

      log.success(`  Gemini returned ${result.codes.length} fault codes`);

      for (const fc of result.codes) {
        if (!fc.code || !fc.title) continue;
        await upsertFaultCode(
          manualId,
          fc.code,
          fc.title,
          fc.description || `Fault ${fc.code}`,
          fc.fixSteps || ["Refer to manufacturer documentation."]
        );
        totalCodes++;
        log.detail(`    ${fc.code} - ${fc.title}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(
        `  Batch extraction failed: ${msg.substring(0, 200)}`
      );
    }
  }

  return totalCodes;
}
