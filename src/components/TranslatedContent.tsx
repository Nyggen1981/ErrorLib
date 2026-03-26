"use client";

import { useEffect, useState, createContext, useContext } from "react";

type Translation = {
  title: string;
  description: string;
  fixSteps: string[];
  causes?: string[];
};

type ContextValue = {
  content: Translation;
  loading: boolean;
};

const TranslationContext = createContext<ContextValue | null>(null);

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error("useTranslation must be used within TranslatedContent");
  return ctx;
}

export function TranslatedContent({
  faultCodeId,
  locale,
  fallback,
  cached,
  children,
}: {
  faultCodeId: string;
  locale: string;
  fallback: Translation;
  cached: Translation | null;
  children: React.ReactNode;
}) {
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

  return (
    <TranslationContext.Provider value={{ content, loading }}>
      {children}
    </TranslationContext.Provider>
  );
}
