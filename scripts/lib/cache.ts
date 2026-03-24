import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, "..", "mined-manuals.json");

type CacheEntry = {
  filename: string;
  url: string;
  brand: string;
  codesExtracted: number;
  status: "completed" | "failed";
  minedAt: string;
};

type CacheFile = {
  version: 1;
  manuals: Record<string, CacheEntry>;
};

function loadCache(): CacheFile {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
  } catch {}
  return { version: 1, manuals: {} };
}

function saveCache(cache: CacheFile): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function cacheKey(filename: string, brand: string): string {
  return `${brand.toLowerCase()}::${filename.toLowerCase()}`;
}

export function isAlreadyMined(filename: string, brand: string): boolean {
  const cache = loadCache();
  const entry = cache.manuals[cacheKey(filename, brand)];
  return entry?.status === "completed";
}

export function markCompleted(
  filename: string,
  url: string,
  brand: string,
  codesExtracted: number
): void {
  const cache = loadCache();
  cache.manuals[cacheKey(filename, brand)] = {
    filename,
    url,
    brand,
    codesExtracted,
    status: "completed",
    minedAt: new Date().toISOString(),
  };
  saveCache(cache);
}

export function markFailed(
  filename: string,
  url: string,
  brand: string
): void {
  const cache = loadCache();
  cache.manuals[cacheKey(filename, brand)] = {
    filename,
    url,
    brand,
    codesExtracted: 0,
    status: "failed",
    minedAt: new Date().toISOString(),
  };
  saveCache(cache);
}

export function getCacheStats(): { total: number; completed: number } {
  const cache = loadCache();
  const entries = Object.values(cache.manuals);
  return {
    total: entries.length,
    completed: entries.filter((e) => e.status === "completed").length,
  };
}

export function isBrandCompleted(brand: string): boolean {
  const cache = loadCache();
  const key = `brand-done::${brand.toLowerCase()}`;
  return cache.manuals[key]?.status === "completed";
}

export function markBrandCompleted(brand: string, totalCodes: number): void {
  const cache = loadCache();
  const key = `brand-done::${brand.toLowerCase()}`;
  cache.manuals[key] = {
    filename: brand,
    url: "",
    brand,
    codesExtracted: totalCodes,
    status: "completed",
    minedAt: new Date().toISOString(),
  };
  saveCache(cache);
}

export function getMinedUrlsForBrand(brand: string): Set<string> {
  const cache = loadCache();
  const urls = new Set<string>();
  for (const entry of Object.values(cache.manuals)) {
    if (
      entry.brand.toLowerCase() === brand.toLowerCase() &&
      entry.url &&
      entry.status === "completed"
    ) {
      urls.add(entry.url);
    }
  }
  return urls;
}

// ─── Text Cache ───
// Persists extracted PDF text so Phase 3 scanning doesn't repeat across runs.

const TEXT_CACHE_DIR = path.resolve(__dirname, "..", ".text-cache");

function textCachePath(filename: string, brand: string): string {
  fs.mkdirSync(TEXT_CACHE_DIR, { recursive: true });
  return path.join(TEXT_CACHE_DIR, `${cacheKey(filename, brand).replace(/::/g, "_")}.json`);
}

export function getTextCache(
  filename: string,
  brand: string
): { pageNumber: number; text: string }[] | null {
  const p = textCachePath(filename, brand);
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch {}
  return null;
}

export function setTextCache(
  filename: string,
  brand: string,
  pages: { pageNumber: number; text: string }[]
): void {
  const p = textCachePath(filename, brand);
  fs.writeFileSync(p, JSON.stringify(pages));
}
