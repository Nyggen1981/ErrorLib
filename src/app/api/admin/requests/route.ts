import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const requests = await prisma.userRequest.findMany({
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ requests });
}

export async function PATCH(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { id, action } = body as { id?: string; action?: string };

  if (!id || !action) {
    return NextResponse.json(
      { error: "id and action are required" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    const request = await prisma.userRequest.update({
      where: { id },
      data: { status: "approved" },
    });

    // Auto-add to mining queue if not already there
    const existing = await prisma.miningQueue.findFirst({
      where: {
        brandName: { equals: request.brand, mode: "insensitive" },
        status: { in: ["pending", "processing"] },
      },
    });

    if (!existing) {
      await prisma.miningQueue.create({
        data: { brandName: request.brand, status: "pending" },
      });
    }

    return NextResponse.json({ ok: true, queueAdded: !existing });
  }

  if (action === "reject") {
    await prisma.userRequest.update({
      where: { id },
      data: { status: "rejected" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
    await prisma.userRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
