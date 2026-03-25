import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandSlug = req.nextUrl.searchParams.get("brand");
  const search = req.nextUrl.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {};

  if (brandSlug) {
    where.manual = { brand: { slug: brandSlug } };
  }

  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }

  const codes = await prisma.faultCode.findMany({
    where,
    take: 100,
    orderBy: { updatedAt: "desc" },
    include: {
      manual: {
        include: { brand: { select: { name: true, slug: true } } },
      },
    },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      description: c.description,
      fixSteps: c.fixSteps,
      brandName: c.manual.brand.name,
      brandSlug: c.manual.brand.slug,
      manualName: c.manual.name,
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title, description, fixSteps } = body as {
    id?: string;
    title?: string;
    description?: string;
    fixSteps?: string[];
  };

  if (!id) {
    return NextResponse.json({ error: "Missing fault code ID" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (fixSteps !== undefined) data.fixSteps = fixSteps;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Reset cached translations when English content changes
  data.translations = {};

  const updated = await prisma.faultCode.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt.toISOString() });
}
