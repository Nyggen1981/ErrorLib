import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { clearLanguageCache } from "@/lib/locale";

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setting = await prisma.siteSetting.findUnique({
    where: { key: "active_languages" },
  });

  const activeLanguages = setting ? JSON.parse(setting.value) : ["en"];

  return NextResponse.json({ activeLanguages });
}

export async function PUT(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { activeLanguages } = (await req.json()) as { activeLanguages?: string[] };

  if (!activeLanguages || !Array.isArray(activeLanguages)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const valid = ["en", "no", "de", "es"];
  const filtered = activeLanguages.filter((l) => valid.includes(l));

  if (!filtered.includes("en")) {
    filtered.unshift("en");
  }

  await prisma.siteSetting.upsert({
    where: { key: "active_languages" },
    update: { value: JSON.stringify(filtered) },
    create: { key: "active_languages", value: JSON.stringify(filtered) },
  });

  clearLanguageCache();

  return NextResponse.json({ activeLanguages: filtered });
}
