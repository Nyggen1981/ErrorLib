"use client";

import { useTranslation } from "@/components/TranslatedContent";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export function QuickFixBanner({
  faultCode,
  brandName,
  locale,
}: {
  faultCode: string;
  brandName: string;
  locale: Locale;
}) {
  const { content } = useTranslation();
  const first = content.causes?.[0];
  if (!first) return null;

  const body = t("quickFixBody", locale)
    .replace("{code}", faultCode)
    .replace("{cause}", first)
    .replace("{brand}", brandName);

  return (
    <aside
      className="mb-5 rounded-lg border border-accent/35 bg-gradient-to-br from-accent/12 to-accent/5 px-4 py-3.5 sm:px-5 sm:py-4"
      aria-label={t("quickFixLabel", locale)}
    >
      <p className="text-sm leading-relaxed text-technical-100">
        <span className="font-semibold text-accent">{t("quickFixLabel", locale)}: </span>
        {body}
      </p>
    </aside>
  );
}
