/**
 * Canonical production origin. Sitemap <loc> and robots sitemap URL always use
 * this — never VERCEL_URL or preview hosts.
 */
export const CANONICAL_SITE_ORIGIN = "https://errorlib.net";

/**
 * Site origin for general use (metadata, etc.). Prefer NEXT_PUBLIC_SITE_URL in
 * env (e.g. localhost in dev); never uses VERCEL_URL.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return CANONICAL_SITE_ORIGIN;
}
