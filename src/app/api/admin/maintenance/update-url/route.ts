import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function isAdmin(token: string | undefined): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  return token === crypto.createHmac("sha256", pw).update("errorlib-admin").digest("hex");
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (!isAdmin(cookieStore.get("admin_token")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { manualId, pdfUrl } = await req.json();

  if (!manualId || typeof pdfUrl !== "string") {
    return NextResponse.json({ error: "manualId and pdfUrl required" }, { status: 400 });
  }

  let isValid = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(pdfUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    isValid = res.ok || res.status === 405 || res.status === 403;
    clearTimeout(timer);
  } catch {
    isValid = false;
  }

  await prisma.manual.update({
    where: { id: manualId },
    data: {
      pdfUrl,
      isBroken: !isValid,
      lastValidated: new Date(),
    },
  });

  return NextResponse.json({ success: true, isValid });
}
