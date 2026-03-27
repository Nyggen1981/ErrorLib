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
  return s.trim();
}

/** Canonical title sanitizer used by miner + cleanup scripts */
export function sanitizeTitle(raw: string): string {
  return washManualTitle(raw);
}
