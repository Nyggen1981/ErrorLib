import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";

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

      seenUrls.add(result.link);
      allResults.push({
        title: result.title,
        link: result.link,
        snippet: result.snippet ?? "",
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
  if (modelMatch) return modelMatch[1].trim();

  if (name.length > 60) name = name.substring(0, 60).trim();

  return name || title.substring(0, 40).trim();
}

export async function extractManualName(
  title: string,
  url: string,
  brand: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return extractManualNameFallback(title, brand);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      `You are naming an industrial equipment manual for a database entry. Your goal is to identify the PRIMARY MODEL NAME the manual covers.

Given this PDF search result:
- Brand: ${brand}
- Search title: "${title}"
- URL: ${url}

RULES (strictly follow):
1. Return the brand name followed by the primary product model/series name.
2. NEVER use a part number as the model name (e.g. "A20B-2101-0390", "6SL3210-1PE21", "E84AVSCx" are part numbers — find the actual product name they belong to).
3. NEVER use a document type as the name (e.g. "Service Bulletin", "Parameter List", "Maintenance Manual", "Connection Guide").
4. NEVER use generic terms (e.g. "Connection", "Guide", "Manual", "System", "Diagnostics", "Error Codes").
5. If the URL or title contains a clear model series (e.g. "ACS880", "Series 30i", "VLT Micro Drive FC 51", "SINAMICS G120"), USE IT.
6. Add a short descriptor only if it clarifies the product type (e.g. "Standard Firmware", "Servo Amplifier", "AC Servo Motor").
7. Maximum 60 characters.

Good examples:
- "${brand} ACS580 General Purpose Drive"
- "${brand} Series 30i CNC Controller"
- "${brand} VLT Micro Drive FC 51"
- "${brand} SINAMICS G120 Variable Speed Drive"
- "${brand} R-30iB Robot Controller"
- "${brand} FR-E500 Inverter"

Bad examples (NEVER return these):
- "${brand} A20B-2101-0390" (part number)
- "${brand} Connection" (generic)
- "${brand} Manual Guide" (document type)
- "${brand} Service Bulletin" (document type)
- "${brand} E84AVSCx" (part number, not product name)

Return ONLY the name, nothing else.`
    );

    const cleaned = result.response.text().trim().replace(/["']/g, "");
    if (cleaned.length > 3 && cleaned.length < 80) {
      return cleaned;
    }
  } catch {
    log.detail(`  Title cleanup skipped (API unavailable), using fallback`);
  }

  return extractManualNameFallback(title, brand);
}
