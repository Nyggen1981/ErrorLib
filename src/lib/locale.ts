import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Locale } from "./i18n";

let cachedActiveLanguages: Locale[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getActiveLanguages(): Promise<Locale[]> {
  const now = Date.now();
  if (cachedActiveLanguages && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedActiveLanguages;
  }

  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "active_languages" },
    });
    if (setting) {
      cachedActiveLanguages = JSON.parse(setting.value) as Locale[];
    } else {
      cachedActiveLanguages = ["en"];
    }
  } catch {
    cachedActiveLanguages = ["en"];
  }

  cacheTimestamp = now;
  return cachedActiveLanguages;
}

export function clearLanguageCache() {
  cachedActiveLanguages = null;
  cacheTimestamp = 0;
}

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const val = jar.get("lang")?.value;
  const active = await getActiveLanguages();

  if (val && active.includes(val as Locale)) return val as Locale;
  return "en";
}
