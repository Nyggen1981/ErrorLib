import { cookies } from "next/headers";
import type { Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const val = jar.get("lang")?.value;
  if (val && ["en", "no", "de", "es"].includes(val)) return val as Locale;
  return "en";
}
