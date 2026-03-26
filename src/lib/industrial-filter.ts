/**
 * Single source of truth for “outside our industrial focus” content.
 * Add phrases here only — miners and search import from this module.
 */

export const OUT_OF_SCOPE_KEYWORDS = [
  "blood pressure",
  "sphygmomanometer",
  "coffee maker",
  "espresso",
  "coffee",
  "massage",
  "nebulizer",
] as const;

/**
 * True if the text (search title, snippet, resolved manual name, etc.) matches
 * any out-of-scope keyword (case-insensitive substring).
 */
export function shouldSkipManual(title: string): boolean {
  const lower = title.toLowerCase();
  return OUT_OF_SCOPE_KEYWORDS.some((kw) => lower.includes(kw));
}
