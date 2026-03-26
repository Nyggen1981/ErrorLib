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
      .replace(/^\s*\[PDF\]\s*/i, "")
      .replace(/^\s*\(PDF\)\s*/i, "")
      .replace(/^\s*PDF\s*[:\-–—]\s*/i, "")
      .replace(/^\s*Manual\s*[:\-–—]\s*/i, "")
      .replace(/^\s*Manual\s+/i, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

export function washManualTitle(raw: string): string {
  let s = stripLeadingNoise(raw.trim());
  for (const [re, rep] of GREEK_TO_LATIN) {
    s = s.replace(re, rep);
  }
  return s.trim();
}
