import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { brand } = body as { brand?: string };

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
    { item, message: `"${name}" queued for heavy re-mining. Run miner with --queue to start.` },
    { status: 201 }
  );
}
