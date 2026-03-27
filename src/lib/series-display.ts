/** Map seriesKey → admin override label (non-empty displayName only). */
export function buildSeriesDisplayMap(
  rows: { seriesKey: string; displayName: string | null }[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const d = r.displayName?.trim();
    if (d) m.set(r.seriesKey, d);
  }
  return m;
}

export function displayTitleForSeries(
  seriesKey: string,
  overrides: Map<string, string>
): string {
  return overrides.get(seriesKey) ?? seriesKey;
}
