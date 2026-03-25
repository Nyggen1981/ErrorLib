import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const query = q.toLowerCase();

  const [faultCodes, brands] = await Promise.all([
    prisma.faultCode.findMany({
      where: {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        code: true,
        title: true,
        slug: true,
        manual: {
          select: {
            slug: true,
            name: true,
            brand: { select: { name: true, slug: true } },
          },
        },
      },
      take: 20,
      orderBy: { code: "asc" },
    }),
    prisma.brand.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        name: true,
        slug: true,
        _count: { select: { manuals: true } },
      },
      take: 5,
    }),
  ]);

  const grouped: Record<
    string,
    {
      brand: string;
      brandSlug: string;
      codes: { code: string; title: string; href: string }[];
    }
  > = {};

  for (const fc of faultCodes) {
    const bName = fc.manual.brand.name;
    if (!grouped[bName]) {
      grouped[bName] = {
        brand: bName,
        brandSlug: fc.manual.brand.slug,
        codes: [],
      };
    }
    grouped[bName].codes.push({
      code: fc.code,
      title: fc.title,
      href: `/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`,
    });
  }

  return NextResponse.json({
    results: {
      brands: brands.map((b) => ({
        name: b.name,
        slug: b.slug,
        manualCount: b._count.manuals,
      })),
      faultGroups: Object.values(grouped),
    },
    query: q,
  });
}
