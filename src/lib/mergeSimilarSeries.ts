/**
 * Merge product-line boxes on the brand page when series names are ~the same
 * (e.g. "SYSMAC CJ2 CPU" vs "CJ-series CJ2 CPU").
 */

export type SeriesGroupMergeable = {
  series: string;
  manuals: unknown[];
  totalCodes: number;
};

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** 0..1 where 1 = identical */
function normalizedLevenshteinSimilarity(a: string, b: string): number {
  const s = a.trim();
  const t = b.trim();
  if (s.length === 0 && t.length === 0) return 1;
  if (s.length === 0 || t.length === 0) return 0;
  const d = levenshteinDistance(s.toLowerCase(), t.toLowerCase());
  return 1 - d / Math.max(s.length, t.length);
}

function tokenSortKey(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Leading drive-style code at the start of the label (e.g. A1000, V1000, J1000).
 * If two series both have such a token and they differ, they must not merge even when
 * the rest of the title is similar (Yaskawa and similar catalogs).
 */
function leadingLetterDigitProductToken(s: string): string | null {
  const m = s.trim().match(/^\s*([A-Za-z]\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Similarity for grouping: max of raw and token-order–invariant Levenshtein,
 * so "SYSMAC CJ2 CPU" vs "CJ-series CJ2 CPU" can still cluster when tokens overlap.
 */
export function seriesNameSimilarity(a: string, b: string): number {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return 1;
  const la = leadingLetterDigitProductToken(a);
  const lb = leadingLetterDigitProductToken(b);
  if (la !== null && lb !== null && la !== lb) return 0;
  const l1 = normalizedLevenshteinSimilarity(a, b);
  const l2 = normalizedLevenshteinSimilarity(tokenSortKey(a), tokenSortKey(b));
  return Math.max(l1, l2);
}

/** Prefer shortest display name; tie-break: fewer words, then locale sort */
export function pickCanonicalSeriesName(names: string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  return unique.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    const wa = a.split(/\s+/).length;
    const wb = b.split(/\s+/).length;
    if (wa !== wb) return wa - wb;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  })[0];
}

/**
 * Union-find merge of groups whose `series` string similarity >= threshold (default 0.8).
 */
export function mergeSimilarSeriesGroups<T extends SeriesGroupMergeable>(
  groups: T[],
  threshold = 0.8
): T[] {
  const n = groups.length;
  if (n <= 1) return groups;

  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (seriesNameSimilarity(groups[i].series, groups[j].series) >= threshold) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(i);
  }

  const merged: T[] = [];
  for (const indices of clusters.values()) {
    const parts = indices.map((idx) => groups[idx]);
    const series = pickCanonicalSeriesName(parts.map((p) => p.series));
    const manuals = parts.flatMap((p) => p.manuals) as T["manuals"];
    const totalCodes = parts.reduce((s, p) => s + p.totalCodes, 0);
    merged.push({ ...parts[0], series, manuals, totalCodes });
  }

  return merged.sort((a, b) =>
    a.series.localeCompare(b.series, undefined, { numeric: true })
  );
}
