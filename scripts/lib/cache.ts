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
