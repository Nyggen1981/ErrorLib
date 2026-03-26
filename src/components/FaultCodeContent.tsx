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

export function TranslatedCauses({ heading }: { heading: string }) {
  const { content } = useTranslation();
  const causes = content.causes;
  if (!causes || causes.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4.5 w-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h2 className="text-lg font-bold text-technical-50">{heading}</h2>
      </div>
      <ul className="space-y-2">
        {causes.map((cause, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-technical-200">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
            {boldTechnicalTerms(cause)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TranslatedTools({ heading }: { heading: string }) {
  const { content } = useTranslation();
  const tools = content.requiredTools;
  if (!tools || tools.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border border-technical-700 bg-technical-800 p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4.5 w-4.5 text-technical-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1 5.1a2.12 2.12 0 01-3-3l5.1-5.1m0 0L15.17 4.42a2.12 2.12 0 013 0l1.41 1.41a2.12 2.12 0 010 3l-7.75 7.75m-4.41-4.41L4.83 15.17" />
        </svg>
        <h2 className="text-lg font-bold text-technical-50">{heading}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {tools.map((tool, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-md border border-technical-600 bg-technical-900/50 px-3 py-1.5 text-xs font-medium text-technical-200"
          >
            {tool}
          </span>
        ))}
      </div>
    </section>
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
