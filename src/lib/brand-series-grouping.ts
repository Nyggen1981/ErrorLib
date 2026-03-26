/**
 * Same logic as the brand page grid: derive "series" / sub-categories from manual names,
 * fold generic buckets, then (in the app) mergeSimilarSeriesGroups is applied on top.
 */

import { washManualTitle } from "@/lib/manual-title-wash";
import { mergeSimilarSeriesGroups } from "./mergeSimilarSeries";

export type ManualWithCount = {
  id: string;
  name: string;
  slug: string;
  _count: { faultCodes: number };
};

export type SeriesGroup = {
  series: string;
  manuals: { manual: ManualWithCount; label: string }[];
  totalCodes: number;
};

const SERIES_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/\b(ACS\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(AC500)/i, () => "AC500"],
  [/\b(AX\d{4})/i, (m) => m[1].toUpperCase()],
  [/\b(PowerFlex)\s*(\d+)/i, (m) => `PowerFlex ${m[2]}`],
  [/\b(VLT)\s+([\w-]+)/i, (m) => `VLT ${m[2]}`],
  [/\b(FC\s*\d{2,3})/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(SINAMICS)\s+(\w+)/i, (m) => `SINAMICS ${m[2]}`],
  [/\b(SINUMERIK)\s+(\w+)/i, (m) => `SINUMERIK ${m[2]}`],
  [/\b(MOVIDRIVE)\b/i, () => "MOVIDRIVE"],
  [/\b(MOVIFIT)\b/i, () => "MOVIFIT"],
  [/\b(MCBSM)\b/i, () => "MCBSM"],
  [/\b(Altivar|ALTIVAR|ATV)\s*(\d+)/i, (m) => `Altivar ${m[2]}`],
  [/\b(Altistart)\s*(\d+)/i, (m) => `Altistart ${m[2]}`],
  [/\b(XW\s*Pro)\b/i, () => "XW Pro"],
  [/\b(TwinCAT)\s*(\d*)/i, (m) => (m[2] ? `TwinCAT ${m[2]}` : "TwinCAT")],
  [/\b(TwinSAFE)\b/i, () => "TwinSAFE"],
  [/\b(FR[-\s]?[A-Z]\d{3})/i, (m) =>
    m[1].replace(/\s+/g, "").replace(/-/g, "-").toUpperCase()],
  [/\b(NXS|NXP)\b/i, () => "NXS/NXP"],
  [/\b(MX2)\b/i, () => "MX2"],
  [/\b(SXF)\b/i, () => "SXF"],
  [/\b(3G3EV)\b/i, () => "3G3EV"],
  [/\b(BP\d{3})/i, (m) => m[1].toUpperCase()],
  [/\b(MSZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(PUZ[-\s]?\w+)/i, (m) => m[1].replace(/\s+/g, "").toUpperCase()],
  [/\b(R-30i[AB]\w*)/i, (m) => m[1].toUpperCase()],
  [/\bSeries\s+(0i[-\s]?\w*)/i, (m) => `Series ${m[1].replace(/\s+/g, "")}`],
  [/\bSeries\s+(3[012]i\S*)/i, (m) => `Series ${m[1]}`],
  [/\bSeries\s+(\d+i\S*)/i, (m) => `Series ${m[1]}`],
  [/[αa]i[\s-]*(?:series|Series)\b/i, () => "αi Series"],
  [/\b(?:series|Series)[\s-]*[αa]i\b/i, () => "αi Series"],
  [/\bAlphai[\s-]*Series\b/i, () => "Alphai Series"],
  [/\bAlphai\b/i, () => "Alphai Series"],
  [/\bMacro\s*B\b/i, () => "Macro B"],
  [/\bKRC\s*(\d+)/i, (m) => `KRC${m[1]}`],
  [/\bKR\s*C(\d+)/i, (m) => `KRC${m[1]}`],
  [/\b([A-Z]\d{3,4})\b/i, (m) => m[1].toUpperCase()],
];

const GENERIC_NAMES = new Set([
  "system",
  "general",
  "other",
  "misc",
  "unknown",
  "diagnostics",
  "alarms",
  "faults",
  "list",
  "connection",
  "manual",
  "manual guide",
  "guide",
  "maintenance",
  "parameter",
  "parameters",
  "information",
  "service",
  "bulletin",
  "installation",
  "reference",
  "description",
  "operator",
  "document",
]);

const PART_NUMBER_RE =
  /^[A-Z]\d{2}[A-Z]-\d|^\d{1,2}[A-Z]{2}\d{4}|^\d{6,}|^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-[A-Z0-9]{2,4}/i;

const DESCRIPTIVE_TAG_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bstandard\s+control\s+program\b/i, label: "Standard control program" },
  { pattern: /\bquick\s+start\b/i, label: "Quick start" },
  { pattern: /\bcontrol\s+program\b/i, label: "Control program" },
  { pattern: /\bfirmware\b/i, label: "Firmware" },
  { pattern: /\bsoftware\b/i, label: "Software" },
  { pattern: /\bhardware\b/i, label: "Hardware" },
  { pattern: /\binverter\b/i, label: "Inverter" },
  { pattern: /\boption\s+(?:card|module|unit)\b/i, label: "Option" },
  { pattern: /\bcommunication\b|\bcommunications\b/i, label: "Communication" },
  { pattern: /\bsafety\b/i, label: "Safety" },
  { pattern: /\binstallation\b/i, label: "Installation" },
  { pattern: /\bmaintenance\b|\bservice\s+manual\b/i, label: "Maintenance" },
  { pattern: /\btroubleshooting\b|\bdiagnostics\b/i, label: "Troubleshooting" },
  { pattern: /\bprogramming\b/i, label: "Programming" },
  { pattern: /\breference\b/i, label: "Reference" },
  { pattern: /\buser\s+guide\b|\buser'?s?\s+manual\b/i, label: "User guide" },
];

function inferDescriptiveTagFromManualName(manualName: string): string {
  for (const { pattern, label } of DESCRIPTIVE_TAG_PATTERNS) {
    if (pattern.test(manualName)) return label;
  }
  return "";
}

export function extractSeries(manualName: string, brandName: string): string {
  const cleaned = washManualTitle(manualName);
  const stripped = cleaned
    .replace(
      new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      ""
    )
    .trim();

  const brandNorm = brandName.trim();
  if (/^huawei$/i.test(brandNorm) && /\bSUN2000\b/i.test(stripped)) {
    return "SUN2000 Series";
  }
  if (/^sma$/i.test(brandNorm) && /\bSunny\s+Boy\b/i.test(stripped)) {
    return "Sunny Boy Series";
  }

  for (const [pattern, extract] of SERIES_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) return extract(match);
  }

  const words = stripped.split(/\s+/);
  const lead = words
    .slice(0, 3)
    .filter((w) => /^[A-Z0-9]/.test(w) && w.length >= 2 && !PART_NUMBER_RE.test(w));
  return lead.length > 0 ? lead.join(" ") : words.slice(0, 2).join(" ");
}

export function manualLabel(
  manualName: string,
  brandName: string,
  series: string
): string {
  const cleanedName = washManualTitle(manualName);
  let label = cleanedName
    .replace(
      new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      ""
    )
    .replace(new RegExp(series.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
    .replace(/^[\s,\-–—:]+/, "")
    .replace(/[\s,\-–—:]+$/, "")
    .replace(/\b(variable\s+speed|frequency|adjustable\s+frequency)\s+(ac\s+)?drive\b/gi, "")
    .replace(/\b(ac\s+)?drive\b/gi, "")
    .replace(/\b(list|manual|guide|handbook|reference|instruction)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const norm = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!label || label.length < 2 || norm === "general") {
    const inferred = inferDescriptiveTagFromManualName(cleanedName);
    return inferred;
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function groupManuals(
  manuals: ManualWithCount[],
  brandName: string
): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();

  for (const manual of manuals) {
    if (manual._count.faultCodes === 0) continue;

    const series = extractSeries(manual.name, brandName);
    const label = manualLabel(manual.name, brandName, series);

    const existing = groups.get(series);
    if (existing) {
      existing.manuals.push({ manual, label });
      existing.totalCodes += manual._count.faultCodes;
    } else {
      groups.set(series, {
        series,
        manuals: [{ manual, label }],
        totalCodes: manual._count.faultCodes,
      });
    }
  }

  const generics: SeriesGroup[] = [];
  const real: SeriesGroup[] = [];

  for (const group of groups.values()) {
    if (GENERIC_NAMES.has(group.series.toLowerCase())) {
      generics.push(group);
    } else {
      real.push(group);
    }
  }

  if (generics.length > 0 && real.length > 0) {
    const largest = real.reduce((a, b) => (a.totalCodes >= b.totalCodes ? a : b));
    for (const g of generics) {
      largest.manuals.push(...g.manuals);
      largest.totalCodes += g.totalCodes;
    }
  } else if (generics.length > 0) {
    real.push(...generics);
  }

  return real.sort((a, b) =>
    a.series.localeCompare(b.series, undefined, { numeric: true })
  );
}

/** Same as brand page: group + 80 % similar-name merge */
export function groupManualsAsOnSite(
  manuals: ManualWithCount[],
  brandName: string,
  mergeThreshold = 0.8
): SeriesGroup[] {
  return mergeSimilarSeriesGroups(groupManuals(manuals, brandName), mergeThreshold);
}
