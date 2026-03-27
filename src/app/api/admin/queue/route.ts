import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const items = await prisma.miningQueue.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { brandName } = body as { brandName?: string };

  if (!brandName || brandName.trim().length === 0) {
    return NextResponse.json(
      { error: "brandName is required" },
      { status: 400 }
    );
  }

  const name = brandName.trim();

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
    data: { brandName: name, status: "pending" },
  });

  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.miningQueue.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
}
