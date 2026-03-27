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

const EXTRACTION_PROMPT = `You are a senior industrial automation engineer analyzing a page from an equipment manual.

Your task: Extract EVERY fault code, error code, or alarm code visible on this page.

For each code found, return:
- "code": The exact alphanumeric fault code as printed (e.g. F0001, A0502, E016, 2310, FL1)
- "title": A short human-readable title (e.g. "Overcurrent", "DC Bus Overvoltage")
- "description": A detailed 2-4 sentence explanation of what causes this fault, what component is affected, and the risk if left unresolved. Write this for a field technician who needs to understand the problem quickly.
- "fixSteps": An array of 3-6 specific, actionable troubleshooting steps in order of priority. Each step should be something a technician can physically do on-site (e.g. "Measure insulation resistance between motor phases and earth using a megger — expect >1 MΩ").

Rules:
- Extract ALL codes on the page, even if there are dozens.
- If the page contains a table of codes, extract every row.
- If a page has NO fault codes at all, return: { "codes": [] }
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

async function callGeminiWithRetry(
  imagePath: string,
  maxRetries = 3
): Promise<ExtractionResult> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent([
        EXTRACTION_PROMPT,
        { inlineData: { mimeType, data: base64Image } },
      ]);

      const raw = result.response.text().trim();
      const cleaned = raw
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(cleaned) as ExtractionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests")) {
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

export async function extractFromImage(
  imagePath: string
): Promise<ExtractionResult> {
  try {
    return await callGeminiWithRetry(imagePath);
  } catch {
    log.warn(`Failed to parse Gemini response for ${path.basename(imagePath)}`);
    return { codes: [] };
  }
}

const DELAY_BETWEEN_PAGES_MS = 4000;

export async function extractAndSave(
  imagePaths: string[],
  manualId: string
): Promise<number> {
  let totalCodes = 0;

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    log.detail(
      `Gemini analyzing [${i + 1}/${imagePaths.length}]: ${path.basename(imgPath)}`
    );

    if (i > 0) {
      await sleep(DELAY_BETWEEN_PAGES_MS);
    }

    try {
      const result = await extractFromImage(imgPath);

      if (result.codes.length === 0) {
        log.detail(`  No fault codes found on this page`);
        continue;
      }

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
        log.success(`  ${fc.code} - ${fc.title}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(
        `  Extraction failed for ${path.basename(imgPath)}: ${msg.substring(0, 120)}`
      );
    }
  }

  return totalCodes;
}
