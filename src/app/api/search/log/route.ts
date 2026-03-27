import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { query, results } = (await req.json()) as {
      query?: string;
      results?: number;
    };

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ ok: false });
    }

    await prisma.searchLog.create({
      data: {
        query: query.trim(),
        results: results ?? 0,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
