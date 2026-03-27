import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function DELETE() {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const deleted = await prisma.miningLog.deleteMany({});
  return NextResponse.json({ ok: true, deleted: deleted.count });
}
