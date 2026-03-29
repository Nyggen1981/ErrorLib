/**
 * SERP-focused titles and descriptions for fault code pages.
 * Brand + code stay at the start so Google is less likely to truncate them.
 */

const TITLE_SUFFIX = " - Quick Solution";
const MAX_TITLE_CHARS = 58;

/**
 * Format: Fix [Brand] [Code]: [Short Description] - Quick Solution
 */
export function buildFaultSeoTitle(
  brand: string,
  code: string,
  shortDescription: string
): string {
  const prefix = `Fix ${brand} ${code}: `;
  const maxShort = MAX_TITLE_CHARS - prefix.length - TITLE_SUFFIX.length;
  if (maxShort < 4) {
    return `Fix ${brand} ${code}${TITLE_SUFFIX}`;
  }
  let short = shortDescription.trim().replace(/\s+/g, " ");
  if (short.length > maxShort) {
    short = short.slice(0, maxShort - 1).trimEnd() + "…";
  }
  return `${prefix}${short}${TITLE_SUFFIX}`;
}

/**
 * Action-oriented meta description (kept under ~160 chars for typical SERP snippets).
 */
export function buildFaultMetaDescription(brand: string, code: string): string {
  return `Machine stopped by ${brand} error ${code}? Get the most common causes and a step-by-step reset guide to fix ${code} fast and minimize downtime.`;
}
