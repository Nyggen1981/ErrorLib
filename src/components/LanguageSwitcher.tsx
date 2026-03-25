"use client";

import { useRouter } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher({
  current,
  activeLanguages,
}: {
  current: Locale;
  activeLanguages: Locale[];
}) {
  const router = useRouter();

  const visible = LOCALES.filter((l) => activeLanguages.includes(l.code));

  if (visible.length <= 1) return null;

  function handleChange(code: Locale) {
    document.cookie = `lang=${code};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {visible.map(({ code, label }, i) => (
        <span key={code} className="flex items-center">
          {i > 0 && <span className="mx-0.5 text-technical-600">|</span>}
          <button
            onClick={() => handleChange(code)}
            className={`rounded px-1.5 py-0.5 transition ${
              current === code
                ? "bg-accent/20 font-semibold text-accent"
                : "text-technical-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}
