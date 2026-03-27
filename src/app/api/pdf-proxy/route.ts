import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const manualId = req.nextUrl.searchParams.get("id");
  if (!manualId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const manual = await prisma.manual.findUnique({
    where: { id: manualId },
    select: { pdfUrl: true, isBroken: true },
  });

  if (!manual?.pdfUrl || manual.isBroken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const upstream = await fetch(manual.pdfUrl, {
      headers: { "User-Agent": "ErrorLib-PDFProxy/1.0" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/pdf";
    const contentLength = upstream.headers.get("content-length");

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Disposition": "inline",
    });
    if (contentLength) headers.set("Content-Length", contentLength);

    // Stream the PDF body through without buffering the whole file in memory
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pdf-proxy] Failed for ${manualId}: ${msg}`);
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
