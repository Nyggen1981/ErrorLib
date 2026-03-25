"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const LOCALE_MAP: Record<string, string> = {
  en: "en",
  no: "nb",
  de: "de",
  es: "es",
};

export function HreflangTags({ activeLanguages }: { activeLanguages: Locale[] }) {
  const pathname = usePathname();

  if (activeLanguages.length <= 1) return null;

  const base = "https://errorlib.net";
  const url = `${base}${pathname}`;

  return (
    <>
      {activeLanguages.map((lang) => (
        <link
          key={lang}
          rel="alternate"
          hrefLang={LOCALE_MAP[lang] ?? lang}
          href={url}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={url} />
    </>
  );
}
