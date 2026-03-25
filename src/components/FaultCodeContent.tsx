"use client";

import React from "react";
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

export function TranslatedPrioritySteps() {
  const { content } = useTranslation();
  const steps = content.fixSteps.slice(0, 3);
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-bold text-technical-900">
            {i + 1}
          </span>
          <span className="text-sm leading-snug text-technical-200">
            {boldTechnicalTerms(step)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TranslatedMoreSteps({ label }: { label: string }) {
  const { content } = useTranslation();
  if (content.fixSteps.length <= 3) return null;
  return (
    <p className="mt-3 text-xs text-technical-400">
      + {content.fixSteps.length - 3} {label}
    </p>
  );
}

export function TranslatedFullSteps() {
  const { content } = useTranslation();
  return (
    <ol className="space-y-3">
      {content.fixSteps.map((step, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-lg border border-technical-600 bg-technical-900/50 p-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent font-mono text-xs font-bold text-technical-900">
            {i + 1}
          </span>
          <p className="pt-0.5 text-sm leading-relaxed text-technical-200">
            {boldTechnicalTerms(step)}
          </p>
        </li>
      ))}
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
