import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 2;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getRetryableBrands(
  allLogs: { brand: string; manual: string; status: string; codesFound: number }[]
) {
  const succeededManuals = new Set(
    allLogs
      .filter((l) => l.status === "success")
      .map((l) => `${l.brand}::${l.manual}`)
  );

  // A "skipped" entry with "(all cached" means the brand went through retry-all
  // and found nothing new — count the entire brand as exhausted
  const exhaustedBrands = new Set(
    allLogs
      .filter(
        (l) =>
          l.status === "skipped" &&
          l.manual.includes("all cached")
      )
      .map((l) => l.brand.toLowerCase())
  );

  // Count how many times each manual has been attempted (failed/aborted/empty)
  const attemptCounts = new Map<string, number>();
  for (const l of allLogs) {
    if (
      l.status === "empty" ||
      l.status === "failed" ||
      l.status === "aborted" ||
      (l.codesFound === 0 && l.status !== "skipped" && l.status !== "success")
    ) {
      const key = `${l.brand}::${l.manual}`;
      attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
    }
  }

  const retryableManuals = [...attemptCounts.entries()].filter(
    ([key, count]) => {
      const brand = key.split("::")[0];
      return (
        !succeededManuals.has(key) &&
        !exhaustedBrands.has(brand.toLowerCase()) &&
        count < MAX_ATTEMPTS
      );
    }
  );

  return [...new Set(retryableManuals.map(([key]) => key.split("::")[0]))];
}

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const allLogs = await prisma.miningLog.findMany({
    select: { brand: true, manual: true, status: true, codesFound: true },
  });

  const uniqueBrands = getRetryableBrands(allLogs);

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
    totalFailed: uniqueBrands.length,
    uniqueBrands: uniqueBrands.length,
    retryableBrands: retryable,
    alreadyQueued: alreadyQueued.map((q) => q.brandName),
  });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { brand, massRetry, manualId, manualIds, force } = body as {
    brand?: string;
    massRetry?: boolean;
    manualId?: string;
    manualIds?: string[];
    force?: boolean;
  };

  if (manualId || (Array.isArray(manualIds) && manualIds.length > 0)) {
    const ids = Array.from(
      new Set(
        [
          ...(manualId ? [manualId] : []),
          ...((manualIds ?? []).filter(Boolean)),
        ].map((s) => s.trim())
      )
    );
    if (ids.length === 0) {
      return NextResponse.json({ error: "manualId/manualIds is required" }, { status: 400 });
    }

    const manuals = await prisma.manual.findMany({
      where: { id: { in: ids } },
      include: { brand: true },
    });
    const manualById = new Map(manuals.map((m) => [m.id, m]));

    const queuedItems: {
      brandName: string;
      status: string;
      force: boolean;
      manualId: string;
      targetManuals: string[];
    }[] = [];
    let cleanedEmptyCodes = 0;
    let clearedLogs = 0;
    for (const id of ids) {
      const manual = manualById.get(id);
      if (!manual) continue;

      // Smart retry: remove known "empty/incomplete" code rows before re-mining this manual.
      const cleanup = await prisma.faultCode.deleteMany({
        where: {
          manualId: manual.id,
          OR: [
            { code: "" },
            { title: "" },
            { description: "" },
            { fixSteps: { isEmpty: true } },
          ],
        },
      });
      cleanedEmptyCodes += cleanup.count;

      const clear = await prisma.miningLog.deleteMany({
        where: {
          brand: manual.brand.name,
          manual: manual.name,
        },
      });
      clearedLogs += clear.count;

      const token = `__MANUAL_ID__:${manual.id}`;
      const existing = await prisma.miningQueue.findFirst({
        where: {
          brandName: { equals: manual.brand.name, mode: "insensitive" },
          status: { in: ["pending", "processing"] },
          targetManuals: { has: token },
        },
      });
      if (existing) continue;

      const payload = [token, "__FORCE_RETRY__"];
      if (force !== false) payload.push("__OVERWRITE__");

      queuedItems.push({
        brandName: manual.brand.name,
        status: "pending",
        force: force !== false,
        manualId: manual.id,
        targetManuals: payload,
      });
    }

    if (queuedItems.length === 0) {
      return NextResponse.json({
        queued: 0,
        message: "All selected manuals are already queued or invalid.",
      });
    }

    const created = await prisma.miningQueue.createMany({ data: queuedItems });
    return NextResponse.json(
      {
        queued: created.count,
        manualIds: ids,
        force: force !== false,
        cleanedEmptyCodes,
        clearedLogs,
        message: `Queued ${created.count} manual retry job(s) (cleaned ${cleanedEmptyCodes} empty code row(s), cleared ${clearedLogs} old log row(s)).`,
      },
      { status: 201 }
    );
  }

  if (massRetry) {
    const allLogs = await prisma.miningLog.findMany({
      select: { brand: true, manual: true, status: true, codesFound: true },
    });

    const uniqueBrands = getRetryableBrands(allLogs);

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
        message: "All failed brands are already in the queue, succeeded, or exhausted retries.",
      });
    }

    const created = await prisma.miningQueue.createMany({
      data: toQueue.map((b) => ({
        brandName: b,
        status: "pending",
        force: true,
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
      force: true,
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
