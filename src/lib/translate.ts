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

  if (!fault) return null;

  const existing = (fault.translations as TranslationsMap) ?? {};
  if (existing[targetLang]) return existing[targetLang];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const langName = LANG_NAMES[targetLang];
  if (!langName) return null;

  try {
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
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as TranslationResult;

    if (!parsed.title || !parsed.description || !Array.isArray(parsed.fixSteps)) {
      return null;
    }

    const updated: TranslationsMap = { ...existing, [targetLang]: parsed };
    await prisma.faultCode.update({
      where: { id: faultCodeId },
      data: { translations: updated },
    });

    return parsed;
  } catch (err) {
    console.error(`[TRANSLATE] Failed for ${faultCodeId} -> ${targetLang}:`, err);
    return null;
  }
}
