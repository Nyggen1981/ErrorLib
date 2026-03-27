"use client";

import { useState, useCallback } from "react";

const P = [107, 106, 101, 116, 105, 108, 110, 121, 103, 97, 114, 100];
const D = [104, 111, 116, 109, 97, 105, 108, 46, 99, 111, 109];
const S = "ErrorLib Inquiry";

function decode(codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

export function ContactEmail({
  display,
  className = "",
}: {
  display: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const addr = `${decode(P)}@${decode(D)}`;
      window.location.href = `mailto:${addr}?subject=${encodeURIComponent(S)}`;
    },
    []
  );

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(display);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    },
    [display]
  );

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href="#"
        onClick={handleClick}
        className="text-accent hover:underline"
      >
        {display}
      </a>
      <button
        onClick={handleCopy}
        title="Copy email address"
        className="inline-flex items-center rounded p-0.5 text-technical-400 transition hover:text-accent"
      >
        {copied ? (
          <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
        )}
      </button>
    </span>
  );
}
