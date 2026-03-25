import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_auth")?.value !== "true") {
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
