import { GoogleGenerativeAI } from "@google/generative-ai";
import { washManualTitle } from "../../src/lib/manual-title-wash.js";
import { shouldSkipManual } from "../../src/lib/industrial-filter.js";
import { log } from "./logger.js";

/** Gemini returns this exact string when the hit is consumer / non-industrial */
export const CONSUMER_MANUAL_SKIP = "CONSUMER_ELECTRONICS_SKIP";

/**
 * True if Gemini returned CONSUMER_ELECTRONICS_SKIP or shouldSkipManual(name)
 * (see src/lib/industrial-filter.ts).
 */
export function isConsumerSkipManualName(name: string): boolean {
  if (name.trim().toUpperCase() === CONSUMER_MANUAL_SKIP) return true;
  return shouldSkipManual(name);
}

const MANUAL_NAME_SYSTEM_INSTRUCTION = `You help catalogue industrial equipment manuals only (automation, drives, PLCs, robots, CNC, process control, industrial power, machine tools).

If the search result is clearly a consumer product unrelated to industrial plant or machine engineering — e.g. home blood pressure monitors, domestic coffee machines, toys, household appliances, consumer gadgets — respond with exactly this single line and nothing else:
${CONSUMER_MANUAL_SKIP}`;

export type SearchResult = {
  title: string;
  link: string;
  snippet: string;
};

export async function searchManuals(
  brand: string,
  maxResults = 10,
  targetSeries?: string[]
): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPER_API_KEY is not set. Get a free key at https://serper.dev"
    );
  }

  let queries: string[];

  if (targetSeries && targetSeries.length > 0) {
    queries = targetSeries.flatMap((series) => [
      `${brand} ${series} fault code list PDF manual filetype:pdf`,
      `${brand} ${series} troubleshooting error codes PDF filetype:pdf`,
    ]);
    log.info(`[EXPAND] Targeted search for ${targetSeries.length} series: ${targetSeries.join(", ")}`);
  } else {
    queries = [
      `${brand} fault code list PDF manual English filetype:pdf`,
      `${brand} troubleshooting guide error codes PDF English filetype:pdf`,
      `${brand} drive diagnostic manual PDF English filetype:pdf`,
    ];
  }

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    log.detail(`Searching: "${query}"`);

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: maxResults,
      }),
    });

    if (!response.ok) {
      log.warn(`Search failed for query: ${query} (${response.status})`);
      continue;
    }

    const data = (await response.json()) as {
      organic?: { title: string; link: string; snippet: string }[];
    };

    for (const result of data.organic ?? []) {
      if (seenUrls.has(result.link)) continue;
      if (!isPdfUrl(result.link)) continue;

      const snippet = result.snippet ?? "";
      if (shouldSkipManual(`${result.title} ${snippet}`)) {
        log.detail(`  [BLOCKLIST] Skipping search hit: ${result.title.slice(0, 72)}…`);
        continue;
      }

      seenUrls.add(result.link);
      allResults.push({
        title: result.title,
        link: result.link,
        snippet,
      });
    }
  }

  return allResults.slice(0, maxResults);
}

function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".pdf") || lower.includes(".pdf");
}

export function extractManualNameFallback(title: string, brand: string): string {
  let name = title
    .replace(/\.(pdf|PDF)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const brandRegex = new RegExp(`^${brand}\\s*`, "i");
  name = name.replace(brandRegex, "").trim();

  const modelMatch = name.match(
    /\b([A-Z]{2,}[\s-]?[A-Z0-9]*[\s-]?\d{2,}[A-Z0-9/-]*)\b/i
  );
  if (modelMatch) name = modelMatch[1].trim();

  if (name.length > 60) name = name.substring(0, 60).trim();

  const raw = name || title.substring(0, 40).trim();
  return washManualTitle(raw);
}

export async function extractManualName(
  title: string,
  url: string,
  brand: string,
  existingNames?: string[]
): Promise<string> {
  if (shouldSkipManual(title)) {
    return CONSUMER_MANUAL_SKIP;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return extractManualNameFallback(title, brand);

  const existingBlock =
    existingNames && existingNames.length > 0
      ? `\nEXISTING MANUALS for ${brand} (use one of these if the new manual covers the same product series — return the EXACT existing string with only a different descriptor suffix if needed):\n${existingNames.map((n) => `  - "${n}"`).join("\n")}\n`
      : "";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: MANUAL_NAME_SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent(
      `You are an industrial equipment librarian cataloguing manuals into a database. Your goal is to identify the PRIMARY MODEL NAME the manual covers, and ensure consistency with existing entries.

Given this PDF search result:
- Brand: ${brand}
- Search title: "${title}"
- URL: ${url}
${existingBlock}
FIRST: If this result is consumer electronics or a non-industrial consumer product (not plant/factory/machine equipment), respond with exactly: ${CONSUMER_MANUAL_SKIP}

Otherwise follow RULES (strictly in this order):
1. FIRST CHECK: If this manual covers the same product series as an existing entry, you MUST reuse that model name. Add a different descriptor suffix to distinguish it (e.g., if "ABB ACS880 Standard Firmware" exists and this is the hardware manual, return "ABB ACS880 Hardware Manual"). Near-matches count — "ACS880" and "ACS 880" are the same product.
2. Return the brand name followed by the primary product model/series name.
3. NEVER use a part number as the model name (e.g. "A20B-2101-0390", "6SL3210-1PE21", "E84AVSCx" are part numbers — find the actual product name they belong to).
4. NEVER use a document type as the ONLY name (e.g. "Service Bulletin", "Parameter List", "Maintenance Manual").
5. NEVER use generic terms alone (e.g. "Connection", "Guide", "Manual", "System", "Diagnostics").
6. If the URL or title contains a clear model series (e.g. "ACS880", "Series 30i", "VLT Micro Drive FC 51", "SINAMICS G120"), USE IT.
7. Add a short descriptor only if it clarifies the product type (e.g. "Standard Firmware", "Servo Amplifier", "AC Servo Motor").
8. Maximum 60 characters.

Good examples:
- "${brand} ACS580 General Purpose Drive"
- "${brand} Series 30i CNC Controller"
- "${brand} VLT Micro Drive FC 51"
- "${brand} R-30iB Robot Controller"

Bad examples (NEVER return these):
- "${brand} A20B-2101-0390" (part number)
- "${brand} Connection" (generic)
- "${brand} Manual Guide" (document type)

Return ONLY the name, nothing else.`
    );

    const cleaned = result.response.text().trim().replace(/["']/g, "");
    if (isConsumerSkipManualName(cleaned)) {
      return CONSUMER_MANUAL_SKIP;
    }
    if (cleaned.length > 3 && cleaned.length < 80) {
      const washed = washManualTitle(cleaned);
      return washed.length > 0 ? washed : extractManualNameFallback(title, brand);
    }
  } catch {
    log.detail(`  Title cleanup skipped (API unavailable), using fallback`);
  }

  return extractManualNameFallback(title, brand);
}
