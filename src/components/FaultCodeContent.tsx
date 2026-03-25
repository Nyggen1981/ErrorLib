"use client";

import { useTranslation } from "./TranslatedContent";

export function TranslatedTitle() {
  const { content } = useTranslation();
  return <>{content.title}</>;
}

export function TranslatedDescription() {
  const { content } = useTranslation();
  return <p className="leading-relaxed text-technical-600">{content.description}</p>;
}

export function TranslatedPrioritySteps() {
  const { content } = useTranslation();
  const steps = content.fixSteps.slice(0, 3);
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-technical-700">
            {step}
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
    <p className="mt-4 text-xs text-technical-400">
      + {content.fixSteps.length - 3} {label}
    </p>
  );
}

export function TranslatedFullSteps() {
  const { content } = useTranslation();
  return (
    <ol className="space-y-4">
      {content.fixSteps.map((step, i) => (
        <li
          key={i}
          className="flex items-start gap-4 rounded-lg border border-technical-100 bg-technical-50 p-4"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-technical-900 font-mono text-sm font-bold text-white">
            {i + 1}
          </span>
          <p className="pt-1 leading-relaxed text-technical-700">{step}</p>
        </li>
      ))}
    </ol>
  );
}

export function TranslatingBanner({ label }: { label: string }) {
  const { loading } = useTranslation();
  if (!loading) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2.5 text-sm text-accent">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </div>
  );
}
