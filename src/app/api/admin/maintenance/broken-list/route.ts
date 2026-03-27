import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function isAdmin(token: string | undefined): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  return token === crypto.createHmac("sha256", pw).update("errorlib-admin").digest("hex");
}

export async function GET() {
  const cookieStore = await cookies();
  if (!isAdmin(cookieStore.get("admin_token")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const manuals = await prisma.manual.findMany({
    where: { isBroken: true },
    select: {
      id: true,
      name: true,
      pdfUrl: true,
      brand: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    manuals: manuals.map((m) => ({
      id: m.id,
      name: m.name,
      brand: m.brand.name,
      pdfUrl: m.pdfUrl ?? "",
    })),
  });
}
