import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [topSearches, recentSearches, totalCount] = await Promise.all([
    prisma.$queryRaw<{ query: string; count: bigint; avg_results: number }[]>`
      SELECT query, COUNT(*) as count, ROUND(AVG(results)) as avg_results
      FROM "SearchLog"
      WHERE "createdAt" > ${sevenDaysAgo}
      GROUP BY query
      ORDER BY count DESC
      LIMIT 20
    `,
    prisma.searchLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { query: true, results: true, createdAt: true },
    }),
    prisma.searchLog.count({
      where: { createdAt: { gt: sevenDaysAgo } },
    }),
  ]);

  return NextResponse.json({
    topSearches: topSearches.map((s) => ({
      query: s.query,
      count: Number(s.count),
      avgResults: Number(s.avg_results),
    })),
    recentSearches,
    totalCount,
  });
}
