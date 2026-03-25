"use client";

import { useEffect, useState } from "react";

type Translation = {
  title: string;
  description: string;
  fixSteps: string[];
};

type Props = {
  faultCodeId: string;
  locale: string;
  fallback: Translation;
  cached: Translation | null;
  children: (content: Translation, loading: boolean) => React.ReactNode;
};

export function TranslatedContent({
  faultCodeId,
  locale,
  fallback,
  cached,
  children,
}: Props) {
  const [content, setContent] = useState<Translation>(cached ?? fallback);
  const [loading, setLoading] = useState(!cached && locale !== "en");

  useEffect(() => {
    if (locale === "en" || cached) return;

    let cancelled = false;

    async function fetchTranslation() {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faultCodeId, targetLang: locale }),
        });

        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.translation) {
            setContent(data.translation);
          }
        }
      } catch {
        /* fall back to English */
      }
      if (!cancelled) setLoading(false);
    }

    fetchTranslation();
    return () => {
      cancelled = true;
    };
  }, [faultCodeId, locale, cached]);

  return <>{children(content, loading)}</>;
}
