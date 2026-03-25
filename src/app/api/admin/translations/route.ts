import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getTranslatedFaultCode } from "@/lib/translate";
import type { Locale } from "@/lib/i18n";

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      manuals: {
        include: {
          faultCodes: { select: { id: true, translations: true } },
        },
      },
    },
  });

  const langs: Locale[] = ["no", "de", "es"];
  const brandData = brands.map((b) => {
    const codes = b.manuals.flatMap((m) => m.faultCodes);
    const total = codes.length;
    const langStats: Record<string, number> = {};

    for (const lang of langs) {
      langStats[lang] = codes.filter((c) => {
        const t = c.translations as Record<string, unknown> | null;
        return t && typeof t === "object" && lang in t;
      }).length;
    }

    return {
      name: b.name,
      slug: b.slug,
      total,
      translations: langStats,
    };
  }).filter((b) => b.total > 0);

  const totals = { total: 0, no: 0, de: 0, es: 0 };
  for (const b of brandData) {
    totals.total += b.total;
    totals.no += b.translations.no ?? 0;
    totals.de += b.translations.de ?? 0;
    totals.es += b.translations.es ?? 0;
  }

  return NextResponse.json({ brands: brandData, totals });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandSlug, lang } = (await req.json()) as {
    brandSlug?: string;
    lang?: string;
  };

  if (!brandSlug || !lang || !["no", "de", "es"].includes(lang)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    include: {
      manuals: {
        include: {
          faultCodes: { select: { id: true, translations: true } },
        },
      },
    },
  });

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const codes = brand.manuals.flatMap((m) => m.faultCodes);
  const missing = codes.filter((c) => {
    const t = c.translations as Record<string, unknown> | null;
    return !t || typeof t !== "object" || !(lang in t);
  });

  let translated = 0;
  let failed = 0;

  for (const code of missing) {
    try {
      const result = await getTranslatedFaultCode(code.id, lang as Locale);
      if (result) translated++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    brand: brand.name,
    lang,
    total: codes.length,
    alreadyDone: codes.length - missing.length,
    translated,
    failed,
  });
}
