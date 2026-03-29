/**
 * Deterministic “template variety” for fault code SERP snippets.
 * Same slug → same template forever (stable for Google).
 */

const MAX_TITLE_CHARS = 60;

/** Suffix after "Brand Code — …"; keep short so long brands still fit. */
const TITLE_TEMPLATES = [
  "Fix & reset fast",
  "Reset—skip long manuals",
  "Troubleshooting, fast",
  "Cut downtime today",
  "Machine stopped? Fix it",
  "Explained: causes & fix",
  "Step-by-step reset",
  "Skip the PDF—quick fix",
] as const;

const DESCRIPTION_TEMPLATES = [
  (brand: string, code: string) =>
    `${brand} ${code} stopping production? Pinpoint causes, reset steps, and ways to minimize downtime—without wading through huge manuals first.`,
  (brand: string, code: string) =>
    `Reset ${brand} error ${code} the smart way: clear causes, a tight troubleshooting path, and less line downtime than digging through OEM PDFs.`,
  (brand: string, code: string) =>
    `Troubleshoot ${brand} ${code} fast—common root causes, practical checks, and step-by-step fixes aimed at getting the machine back under control.`,
  (brand: string, code: string) =>
    `Downtime from ${brand} ${code}? Act on the usual causes, follow a focused reset path, and avoid the slow “read the whole manual” trap.`,
  (brand: string, code: string) =>
    `Machine stopped on ${brand} ${code}? Get an action-first guide: likely faults, reset sequence, and tips to shorten time offline.`,
  (brand: string, code: string) =>
    `${brand} ${code} explained in plain terms—what it means, what typically triggers it, and what to try before you burn hours in documentation.`,
  (brand: string, code: string) =>
    `Step-by-step help for ${brand} ${code}: ordered checks, reset guidance, and downtime-minded fixes—built for shop floors, not theory.`,
  (brand: string, code: string) =>
    `Skip manual-hunting for ${brand} ${code}. Start with high-hit causes, a practical reset flow, and moves that protect uptime on the line.`,
] as const;

/** FNV-1a 32-bit — stable across Node runtimes for the same string. */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function faultTemplateIndex(faultSlug: string): number {
  return fnv1a32(faultSlug) % TITLE_TEMPLATES.length;
}

/**
 * `[Brand] [Code]` first, then template text. Capped at MAX_TITLE_CHARS.
 */
export function buildFaultSeoTitle(
  brand: string,
  code: string,
  faultSlug: string
): string {
  const idx = faultTemplateIndex(faultSlug);
  let tail: string = TITLE_TEMPLATES[idx];
  const prefix = `${brand} ${code}`;
  const sep = " — ";
  const room = MAX_TITLE_CHARS - prefix.length - sep.length;
  if (room < 4) {
    return prefix.length <= MAX_TITLE_CHARS
      ? prefix
      : `${prefix.slice(0, MAX_TITLE_CHARS - 1)}…`;
  }
  if (tail.length > room) {
    tail = `${tail.slice(0, Math.max(room - 1, 4)).trimEnd()}…`;
  }
  return `${prefix}${sep}${tail}`;
}

/**
 * Matching description for the same template index as the title.
 */
export function buildFaultMetaDescription(
  brand: string,
  code: string,
  faultSlug: string
): string {
  const idx = faultTemplateIndex(faultSlug);
  let text = DESCRIPTION_TEMPLATES[idx](brand, code).replace(/\s+/g, " ").trim();
  if (text.length > 160) {
    text = `${text.slice(0, 156).trimEnd()}…`;
  }
  return text;
}
