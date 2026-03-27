/**
 * Normalize manual display names before DB save (scripts) and when deriving series/labels (site).
 */

const GREEK_TO_LATIN: [RegExp, string][] = [
  [/α/g, "Alpha"],
  [/Α/g, "Alpha"],
  [/β/g, "Beta"],
  [/Β/g, "Beta"],
  [/γ/g, "Gamma"],
  [/Γ/g, "Gamma"],
  [/δ/g, "Delta"],
  [/Δ/g, "Delta"],
  [/ε/g, "Epsilon"],
  [/Ε/g, "Epsilon"],
  [/ζ/g, "Zeta"],
  [/Ζ/g, "Zeta"],
  [/η/g, "Eta"],
  [/Η/g, "Eta"],
  [/θ/g, "Theta"],
  [/Θ/g, "Theta"],
  [/λ/g, "Lambda"],
  [/Λ/g, "Lambda"],
  [/μ/g, "Mu"],
  [/Μ/g, "Mu"],
  [/π/g, "Pi"],
  [/Π/g, "Pi"],
  [/σ/g, "Sigma"],
  [/Σ/g, "Sigma"],
  [/φ/g, "Phi"],
  [/Φ/g, "Phi"],
  [/ω/g, "Omega"],
  [/Ω/g, "Omega"],
];

function stripLeadingNoise(s: string): string {
  let t = s;
  for (;;) {
    const next = t
      .replace(/^\s*\[[^\]]+\]\s*/i, "")
      .replace(/^\s*\[PDF\]\s*/i, "")
      .replace(/^\s*\(PDF\)\s*/i, "")
      .replace(/^\s*PDF\s*[:\-–—]\s*/i, "")
      .replace(/^\s*Manual\s*[:\-–—]\s*/i, "")
      .replace(/^\s*Manual\s*[–—-]\s*/i, "")
      .replace(/^\s*Manual\s+/i, "")
      .replace(/^\s*Operating\s+Instructions\s*[:\-–—]?\s*/i, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Remove trailing "AC Drive(s)" noise from product lines (e.g. PowerFlex). */
export function stripAcDrivesPhrase(s: string): string {
  return s
    .replace(/\bAC\s+Drives?\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Allen-Bradley combined catalog → single series label. */
export function normalizePowerFlexCompound(s: string): string {
  return s.replace(
    /\bPowerFlex\s*4\s+and\s+PowerFlex\s*40\b/gi,
    "PowerFlex 4 / 40"
  );
}

/** Collapse consecutive duplicate words (case-insensitive), e.g. "Drive Drive" → "Drive". */
export function deduplicateAdjacentWords(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of parts) {
    if (
      out.length > 0 &&
      out[out.length - 1]!.toLowerCase() === w.toLowerCase()
    ) {
      continue;
    }
    out.push(w);
  }
  let s = out.join(" ");
  // Redundant standalone "Drive" after a token that already ends with "drive" (e.g. IndraDrive Drive).
  s = s.replace(/\b(\S*?[dD]rive)\s+Drive\b(?=\s|$)/gi, "$1");
  s = s.replace(/\bDrive\s+Drive\b/gi, "Drive");
  // Explicit Bosch/Rexroth line
  s = s.replace(/\bindra\s*drive\s+drive\b/gi, "IndraDrive");
  return s.replace(/\s+/g, " ").trim();
}

const INDUSTRY_TAIL = [
  "drives",
  "drive",
  "controllers",
  "controller",
  "inverters",
  "inverter",
  "motors",
  "motor",
] as const;

function stemContainsIndustryWord(stemLower: string, tailLower: string): boolean {
  const base = tailLower.replace(/s$/, "");
  if (base === "drive" && stemLower.includes("drive")) return true;
  if (
    (base === "controller" || base === "control") &&
    (stemLower.includes("control") || stemLower.endsWith("controller"))
  ) {
    return true;
  }
  if (base === "inverter" && stemLower.includes("inverter")) return true;
  if (base === "motor" && stemLower.includes("motor")) return true;
  return false;
}

/**
 * Drop a trailing industry word when the rest of the title already implies it
 * (e.g. "IndraDrive Drive" → "IndraDrive").
 */
export function deduplicateTerms(title: string): string {
  let words = deduplicateAdjacentWords(title).split(/\s+/).filter(Boolean);
  while (words.length >= 2) {
    const last = words[words.length - 1]!.toLowerCase();
    const hit = INDUSTRY_TAIL.find((w) => last === w);
    if (!hit) break;
    const stem = words.slice(0, -1).join(" ").toLowerCase();
    if (!stemContainsIndustryWord(stem, last)) break;
    words = words.slice(0, -1);
  }
  return words.join(" ");
}

/** Title cleanup for series keys and miner output (adjacent dupes + redundant industry tails). */
export function cleanSeriesTitle(title: string): string {
  const t = normalizePowerFlexCompound(stripAcDrivesPhrase(title.trim()));
  return deduplicateTerms(deduplicateAdjacentWords(t));
}

export function washManualTitle(raw: string): string {
  let s = stripLeadingNoise(raw.trim());
  // Common UTF-8 mojibake for Greek letters (e.g. Fanuc αi in PDFs)
  s = s
    .replace(/╬▒/g, "Alpha")
    .replace(/╬▓/g, "Beta")
    .replace(/Î±/g, "Alpha")
    .replace(/Î²/g, "Beta");
  for (const [re, rep] of GREEK_TO_LATIN) {
    s = s.replace(re, rep);
  }
  // Fanuc-style "αi" / "βi" product lines → spaced Latin (after single-letter Greek → word replace)
  s = s.replace(/\bAlphai\b/gi, "Alpha i");
  s = s.replace(/\bBetai\b/gi, "Beta i");
  return normalizePowerFlexCompound(stripAcDrivesPhrase(s.trim()));
}

/** Canonical title sanitizer used by miner + cleanup scripts */
export function sanitizeTitle(raw: string): string {
  return cleanSeriesTitle(washManualTitle(raw));
}
