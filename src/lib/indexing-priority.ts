/**
 * Lavere tall = høyere prioritet i Google Indexing API-køen.
 * Juster rekkefølgen etter hvilke merker du vil pushe først.
 */
export const INDEXING_PRIORITY_BRAND_SLUGS: string[] = [
  "bosch-rexroth",
  "bosch",
  "fanuc",
  "mitsubishi-electric",
  "siemens",
  "abb",
  "allen-bradley",
  "rockwell-allen-bradley",
  "yaskawa",
  "schneider-electric",
  "danfoss",
  "lenze",
];

export function indexingBrandPriorityScore(brandSlug: string): number {
  const i = INDEXING_PRIORITY_BRAND_SLUGS.indexOf(brandSlug);
  return i === -1 ? INDEXING_PRIORITY_BRAND_SLUGS.length + 1 : i;
}
