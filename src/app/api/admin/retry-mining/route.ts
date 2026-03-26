import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const failedLogs = await prisma.miningLog.findMany({
    where: {
      OR: [
        { status: { in: ["empty", "failed", "aborted"] } },
        { codesFound: 0, status: { not: "skipped" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { brand: true, manual: true, status: true, createdAt: true },
  });

  const uniqueBrands = [...new Set(failedLogs.map((l) => l.brand))];

  const alreadyQueued = await prisma.miningQueue.findMany({
    where: {
      brandName: { in: uniqueBrands, mode: "insensitive" },
      status: { in: ["pending", "processing"] },
    },
    select: { brandName: true },
  });
  const queuedSet = new Set(alreadyQueued.map((q) => q.brandName.toLowerCase()));

  const retryable = uniqueBrands.filter(
    (b) => !queuedSet.has(b.toLowerCase())
  );

  return NextResponse.json({
    totalFailed: failedLogs.length,
    uniqueBrands: uniqueBrands.length,
    retryableBrands: retryable,
    alreadyQueued: alreadyQueued.map((q) => q.brandName),
  });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { brand, massRetry } = body as {
    brand?: string;
    massRetry?: boolean;
  };

  if (massRetry) {
    const allLogs = await prisma.miningLog.findMany({
      select: { brand: true, manual: true, status: true, codesFound: true },
    });

    const succeededManuals = new Set(
      allLogs
        .filter((l) => l.status === "success")
        .map((l) => `${l.brand}::${l.manual}`)
    );

    const failedBrands = new Set(
      allLogs
        .filter(
          (l) =>
            (l.status === "empty" ||
              l.status === "failed" ||
              l.status === "aborted" ||
              (l.codesFound === 0 && l.status !== "skipped")) &&
            !succeededManuals.has(`${l.brand}::${l.manual}`)
        )
        .map((l) => l.brand)
    );

    const uniqueBrands = [...failedBrands];

    const alreadyQueued = await prisma.miningQueue.findMany({
      where: {
        brandName: { in: uniqueBrands, mode: "insensitive" },
        status: { in: ["pending", "processing"] },
      },
      select: { brandName: true },
    });
    const queuedSet = new Set(
      alreadyQueued.map((q) => q.brandName.toLowerCase())
    );

    const toQueue = uniqueBrands.filter(
      (b) => !queuedSet.has(b.toLowerCase())
    );

    if (toQueue.length === 0) {
      return NextResponse.json({
        queued: 0,
        message: "All failed brands are already in the queue or already succeeded.",
      });
    }

    const created = await prisma.miningQueue.createMany({
      data: toQueue.map((b) => ({
        brandName: b,
        status: "pending",
        targetManuals: ["__FORCE_RETRY__"],
      })),
    });

    return NextResponse.json(
      {
        queued: created.count,
        brands: toQueue,
        message: `Queued ${created.count} brand(s) for heavy re-mining.`,
      },
      { status: 201 }
    );
  }

  if (!brand || brand.trim().length === 0) {
    return NextResponse.json(
      { error: "brand is required" },
      { status: 400 }
    );
  }

  const name = brand.trim();

  const existing = await prisma.miningQueue.findFirst({
    where: {
      brandName: { equals: name, mode: "insensitive" },
      status: { in: ["pending", "processing"] },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: `"${name}" is already in the queue` },
      { status: 409 }
    );
  }

  const item = await prisma.miningQueue.create({
    data: {
      brandName: name,
      status: "pending",
      targetManuals: ["__FORCE_RETRY__"],
    },
  });

  return NextResponse.json(
    {
      item,
      message: `"${name}" queued for heavy re-mining. Run miner with --queue to start.`,
    },
    { status: 201 }
  );
}
