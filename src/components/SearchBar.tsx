"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

type BrandResult = { name: string; slug: string; manualCount: number };
type CodeResult = { code: string; title: string; manual?: string; href: string };
type FaultGroup = { brand: string; brandSlug: string; codes: CodeResult[] };
type SearchResults = { brands: BrandResult[]; faultGroups: FaultGroup[] } | null;

function MagIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function NoResultsView({
  query,
  locale,
  logSearch,
  onClose,
}: {
  query: string;
  locale: Locale;
  logSearch: (q: string, results: number) => void;
  onClose: () => void;
}) {
  const logged = useRef(false);
  useEffect(() => {
    if (!logged.current) {
      logged.current = true;
      logSearch(query, 0);
    }
  }, [query, logSearch]);

  return (
    <div className="px-5 py-6 text-center">
      <p className="text-sm text-technical-400">
        {t("noResults", locale)}
      </p>
      <a
        href="/#request"
        className="mt-2 inline-block text-sm font-medium text-accent transition hover:text-accent/80"
        onClick={onClose}
      >
        {t("noResultsCta", locale)} →
      </a>
    </div>
  );
}

export function SearchBar({
  variant = "header",
  locale,
}: {
  variant?: "hero" | "header";
  locale: Locale;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isHero = variant === "hero";

  const logSearch = useCallback((q: string, resultCount: number) => {
    fetch("/api/search/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, results: resultCount }),
    }).catch(() => {});
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        setOpen(true);
      }
    } catch {}
    setLoading(false);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 250);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const hasResults =
    results &&
    (results.brands.length > 0 || results.faultGroups.length > 0);

  return (
    <div ref={containerRef} className={`relative ${isHero ? "w-full" : ""}`}>
      <div
        className={`flex items-center gap-2 rounded-xl border transition-colors ${
          isHero
            ? "border-technical-600 bg-technical-800 px-5 py-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
            : "border-technical-700 bg-technical-800 px-3 py-2 focus-within:border-accent"
        }`}
      >
        <MagIcon
          className={`shrink-0 text-technical-500 ${isHero ? "h-5 w-5" : "h-4 w-4"}`}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.length >= 2 && results && setOpen(true)}
          placeholder={
            isHero
              ? t("searchHeroPlaceholder", locale)
              : t("searchPlaceholder", locale)
          }
          className={`w-full bg-transparent text-white placeholder-technical-500 outline-none ${
            isHero ? "text-base sm:text-lg" : "text-sm"
          }`}
        />
        {loading && (
          <svg
            className="h-4 w-4 shrink-0 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
      </div>

      {/* Dropdown */}
      {open && results && (
        <div
          className={`absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-technical-700 bg-technical-900 shadow-2xl ${
            isHero ? "max-h-[28rem]" : "max-h-80"
          } overflow-y-auto`}
        >
          {!hasResults ? (
            <NoResultsView query={query} locale={locale} logSearch={logSearch} onClose={() => setOpen(false)} />
          ) : (
            <div className="divide-y divide-technical-800">
              {/* Brand matches */}
              {results.brands.length > 0 && (
                <div className="p-3">
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-technical-500">
                    Brands
                  </p>
                  {results.brands.map((b) => (
                    <a
                      key={b.slug}
                      href={`/${b.slug}`}
                      onClick={() => { logSearch(query, 1); setOpen(false); }}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-technical-200 transition hover:bg-technical-800"
                    >
                      <span className="font-medium">{b.name}</span>
                      <span className="text-xs text-technical-500">
                        {b.manualCount} manuals
                      </span>
                    </a>
                  ))}
                </div>
              )}

              {/* Fault code matches grouped by brand */}
              {results.faultGroups.map((group) => (
                <div key={group.brandSlug} className="py-2">
                  <div
                    className="mb-1 flex items-center gap-2"
                    style={{ paddingLeft: 76, textAlign: "left" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-technical-500">
                      {group.brand}
                    </p>
                    <span className="text-[10px] tabular-nums text-technical-600">
                      {group.codes.length} {group.codes.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  {group.codes.slice(0, 6).map((fc) => (
                    <a
                      key={fc.href}
                      href={fc.href}
                      onClick={() => { logSearch(query, group.codes.length); setOpen(false); }}
                      className="rounded-lg py-2 transition hover:bg-technical-800"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "64px 1fr",
                        columnGap: 12,
                        alignItems: "center",
                        justifyItems: "start",
                        textAlign: "left",
                        width: "100%",
                        paddingLeft: 0,
                        paddingRight: 12,
                      }}
                    >
                      <span
                        className="overflow-hidden rounded bg-technical-700 py-0.5 font-mono text-xs font-bold text-accent"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxSizing: "border-box",
                          width: 64,
                          minWidth: 64,
                          maxWidth: 64,
                        }}
                      >
                        <span className="truncate px-1">{fc.code}</span>
                      </span>
                      <div
                        className="overflow-hidden"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <p className="w-full truncate text-sm text-technical-300">
                          {fc.title}
                        </p>
                        {fc.manual && (
                          <p className="w-full truncate text-xs text-technical-500">
                            {fc.manual}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                  {group.codes.length > 6 && (
                    <a
                      href={`/${group.brandSlug}`}
                      onClick={() => { logSearch(query, group.codes.length); setOpen(false); }}
                      className="block py-1.5 text-xs text-accent transition hover:text-accent/80"
                      style={{ paddingLeft: 76, textAlign: "left" }}
                    >
                      + {group.codes.length - 6} more from {group.brand} →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
