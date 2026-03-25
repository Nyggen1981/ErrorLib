import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type FaultCodeSelect = {
  code: string;
  title: string;
  slug: string;
  manual: {
    slug: string;
    name: string;
    brand: { name: string; slug: string };
  };
};

const FC_SELECT = {
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
} as const;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const words = q.split(/\s+/).filter((w) => w.length >= 2);

  const allBrands = await prisma.brand.findMany({
    select: { name: true, slug: true, _count: { select: { manuals: true } } },
  });

  const brandMatch = allBrands.find((b) =>
    words.some((w) => b.name.toLowerCase().includes(w.toLowerCase()))
  );

  const remainingWords = brandMatch
    ? words.filter(
        (w) => !brandMatch.name.toLowerCase().includes(w.toLowerCase())
      )
    : words;

  let faultCodes: FaultCodeSelect[];

  if (brandMatch && remainingWords.length > 0) {
    const keyword = remainingWords.join(" ");
    faultCodes = await prisma.faultCode.findMany({
      where: {
        manual: { brand: { slug: brandMatch.slug } },
        OR: [
          { code: { contains: keyword, mode: "insensitive" } },
          { title: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: FC_SELECT,
      take: 20,
      orderBy: { code: "asc" },
    });
  } else if (brandMatch && remainingWords.length === 0) {
    faultCodes = await prisma.faultCode.findMany({
      where: { manual: { brand: { slug: brandMatch.slug } } },
      select: FC_SELECT,
      take: 20,
      orderBy: { code: "asc" },
    });
  } else {
    faultCodes = await prisma.faultCode.findMany({
      where: {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          ...words.flatMap((w) => [
            { code: { contains: w, mode: "insensitive" as const } },
            { title: { contains: w, mode: "insensitive" as const } },
          ]),
        ],
      },
      select: FC_SELECT,
      take: 20,
      orderBy: { code: "asc" },
    });
  }

  const matchedBrands = brandMatch
    ? [brandMatch]
    : allBrands.filter((b) =>
        b.name.toLowerCase().includes(q.toLowerCase())
      );

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

  const totalResults = faultCodes.length + matchedBrands.length;

  prisma.searchLog
    .create({ data: { query: q, results: totalResults } })
    .catch(() => {});

  return NextResponse.json({
    results: {
      brands: matchedBrands.slice(0, 5).map((b) => ({
        name: b.name,
        slug: b.slug,
        manualCount: b._count.manuals,
      })),
      faultGroups: Object.values(grouped),
    },
    query: q,
  });
}
