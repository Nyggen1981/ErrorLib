"use client";

import React, { useState } from "react";
import { useTranslation } from "./TranslatedContent";

function boldTechnicalTerms(text: string): React.ReactNode[] {
  const pattern = /\b([A-Z]{1,4}\d[\d.]*|\d{1,3}\.\d{2,}|P\d[\d.]*|[A-Z]{2,3}\d{1,2})\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <strong key={match.index} className="text-technical-50">
        {match[0]}
      </strong>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function TranslatedTitle() {
  const { content } = useTranslation();
  return <>{content.title}</>;
}

export function TranslatedDescription() {
  const { content } = useTranslation();
  return (
    <p className="leading-relaxed text-technical-200">
      {boldTechnicalTerms(content.description)}
    </p>
  );
}

export function TranslatedAllSteps() {
  const { content } = useTranslation();
  const [checked, setChecked] = useState<Set<number>>(new Set());

  if (content.fixSteps.length === 0) return null;

  function toggle(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <ol className="space-y-3">
      {content.fixSteps.map((step, i) => {
        const done = checked.has(i);
        return (
          <li
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => toggle(i)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(i); } }}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors select-none ${
              done
                ? "border-success/40 bg-success/5"
                : "border-technical-600 bg-technical-900/50"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-xs font-bold transition-colors ${
                done
                  ? "bg-success text-white"
                  : "bg-accent text-technical-900"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <p
              className={`pt-0.5 text-sm leading-relaxed transition-colors ${
                done ? "text-technical-400 line-through" : "text-technical-200"
              }`}
            >
              {boldTechnicalTerms(step)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function TranslatingBanner({ label }: { label: string }) {
  const { loading } = useTranslation();
  if (!loading) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </div>
  );
}
