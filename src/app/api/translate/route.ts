import { NextRequest, NextResponse } from "next/server";
import { getTranslatedFaultCode, TranslateError } from "@/lib/translate";
import { getActiveLanguages } from "@/lib/locale";
import type { Locale } from "@/lib/i18n";

export async function POST(req: NextRequest) {
  try {
    const { faultCodeId, targetLang } = (await req.json()) as {
      faultCodeId?: string;
      targetLang?: string;
    };

    if (!faultCodeId || !targetLang) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    if (!["no", "de", "es"].includes(targetLang)) {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }

    const active = await getActiveLanguages();
    if (!active.includes(targetLang as Locale)) {
      return NextResponse.json({ error: "Language not active" }, { status: 400 });
    }

    const result = await getTranslatedFaultCode(
      faultCodeId,
      targetLang as Locale
    );

    if (!result) {
      return NextResponse.json(
        { error: "Translation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ translation: result });
  } catch (err) {
    const reason = err instanceof TranslateError ? err.reason : "unknown";
    const detail = err instanceof TranslateError ? err.detail : String(err);
    return NextResponse.json({ error: reason, detail }, { status: 500 });
  }
}
