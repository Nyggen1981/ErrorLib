/**
 * Canonical site origin for sitemaps, robots, and absolute URLs.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://errorlib.net).
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://errorlib.net";
}
