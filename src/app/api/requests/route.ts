import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAdminAlert } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, model, email } = body as {
      brand?: string;
      model?: string;
      email?: string;
    };

    if (!brand || brand.trim().length === 0) {
      return NextResponse.json(
        { error: "Brand name is required" },
        { status: 400 }
      );
    }

    const cleanBrand = brand.trim();
    const cleanModel = model?.trim() || null;
    const cleanEmail = email?.trim() || null;

    const existing = await prisma.userRequest.findFirst({
      where: {
        brand: { equals: cleanBrand, mode: "insensitive" },
        ...(cleanModel
          ? { model: { equals: cleanModel, mode: "insensitive" } }
          : { model: null }),
        status: { not: "rejected" },
      },
    });

    if (existing) {
      const updated = await prisma.userRequest.update({
        where: { id: existing.id },
        data: {
          voteCount: { increment: 1 },
          ...(cleanEmail && !existing.email ? { email: cleanEmail } : {}),
        },
      });

      sendAdminAlert(cleanBrand, cleanModel, cleanEmail).catch(() => {});

      return NextResponse.json({
        action: "voted",
        voteCount: updated.voteCount,
      });
    }

    await prisma.userRequest.create({
      data: {
        brand: cleanBrand,
        model: cleanModel,
        email: cleanEmail,
        status: "pending",
        voteCount: 1,
      },
    });

    sendAdminAlert(cleanBrand, cleanModel, cleanEmail).catch(() => {});

    return NextResponse.json({ action: "created" }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
