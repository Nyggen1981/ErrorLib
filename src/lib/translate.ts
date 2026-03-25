import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const LANG_NAMES: Record<string, string> = {
  no: "Norwegian",
  de: "German",
  es: "Spanish",
};

type TranslationResult = {
  description: string;
  fixSteps: string[];
  title: string;
};

type TranslationsMap = Record<string, TranslationResult>;

export class TranslateError extends Error {
  constructor(public reason: string, public detail?: string) {
    super(reason);
    this.name = "TranslateError";
  }
}

export async function getTranslatedFaultCode(
  faultCodeId: string,
  targetLang: Locale
): Promise<TranslationResult | null> {
  if (targetLang === "en") return null;

  const fault = await prisma.faultCode.findUnique({
    where: { id: faultCodeId },
    select: {
      id: true,
      title: true,
      description: true,
      fixSteps: true,
      translations: true,
    },
  });

  if (!fault) throw new TranslateError("not_found", "Fault code not found in DB");

  const existing = (fault.translations as TranslationsMap) ?? {};
  if (existing[targetLang]) return existing[targetLang];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TranslateError("no_api_key", "GEMINI_API_KEY is not set");

  const langName = LANG_NAMES[targetLang];
  if (!langName) throw new TranslateError("invalid_lang", `Unknown language: ${targetLang}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Translate the following industrial fault code information from English to ${langName}.
Keep all technical terms, model numbers, and fault codes unchanged.
Return ONLY valid JSON with this exact structure:
{"title": "...", "description": "...", "fixSteps": ["step1", "step2", ...]}

English content:
Title: ${fault.title}
Description: ${fault.description}
Fix Steps:
${fault.fixSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new TranslateError("parse_error", "No JSON in Gemini response");

  const parsed = JSON.parse(jsonMatch[0]) as TranslationResult;

  if (!parsed.title || !parsed.description || !Array.isArray(parsed.fixSteps)) {
    throw new TranslateError("invalid_json", "Gemini returned incomplete fields");
  }

  const updated: TranslationsMap = { ...existing, [targetLang]: parsed };
  await prisma.faultCode.update({
    where: { id: faultCodeId },
    data: { translations: updated },
  });

  return parsed;
}
