"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const FLAGS: { code: Locale; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "no", flag: "🇳🇴", label: "Norsk" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();

  function handleChange(code: Locale) {
    document.cookie = `lang=${code};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      {FLAGS.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          title={label}
          className={`rounded px-1.5 py-1 text-base leading-none transition ${
            current === code
              ? "bg-white/10 ring-1 ring-accent/50"
              : "opacity-50 hover:opacity-100"
          }`}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
