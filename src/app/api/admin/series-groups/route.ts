import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { groupManualsAsOnSite } from "@/lib/brand-series-grouping";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug query required" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({
    where: { slug },
    include: {
      manuals: {
        include: { _count: { select: { faultCodes: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const manuals = brand.manuals.filter((m) => m._count.faultCodes > 0);
  const groups = groupManualsAsOnSite(manuals, brand.name);

  const overrides = await prisma.seriesGroup.findMany({
    where: { brandId: brand.id },
    select: { seriesKey: true, displayName: true },
  });
  const byKey = new Map(
    overrides.map((o) => [o.seriesKey, o.displayName] as const)
  );

  return NextResponse.json({
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    series: groups.map((g) => ({
      seriesKey: g.series,
      displayName: byKey.get(g.series) ?? null,
      manualCount: g.manuals.length,
      totalCodes: g.totalCodes,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  let body: { brandSlug?: string; seriesKey?: string; displayName?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandSlug = body.brandSlug?.trim();
  const seriesKey = body.seriesKey?.trim();
  if (!brandSlug || !seriesKey) {
    return NextResponse.json(
      { error: "brandSlug and seriesKey required" },
      { status: 400 }
    );
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!displayName) {
    await prisma.seriesGroup.deleteMany({
      where: { brandId: brand.id, seriesKey },
    });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const row = await prisma.seriesGroup.upsert({
    where: {
      brandId_seriesKey: { brandId: brand.id, seriesKey },
    },
    create: {
      brandId: brand.id,
      seriesKey,
      displayName,
    },
    update: { displayName },
  });

  return NextResponse.json({ ok: true, id: row.id, displayName: row.displayName });
}
