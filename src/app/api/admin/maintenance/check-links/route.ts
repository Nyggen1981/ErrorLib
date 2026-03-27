import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendBrokenLinksAlert } from "@/lib/email";
import crypto from "crypto";

const TIMEOUT_MS = 8000;

async function checkUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    return res.ok || res.status === 405 || res.status === 403;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isAdmin(token: string | undefined): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  return token === crypto.createHmac("sha256", pw).update("errorlib-admin").digest("hex");
}

export async function POST() {
  const cookieStore = await cookies();
  if (!isAdmin(cookieStore.get("admin_token")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const manuals = await prisma.manual.findMany({
    where: { pdfUrl: { not: null } },
    select: {
      id: true,
      name: true,
      pdfUrl: true,
      isBroken: true,
      brand: { select: { name: true } },
    },
  });

  const results: {
    id: string;
    brand: string;
    manual: string;
    url: string;
    ok: boolean;
    wasBroken: boolean;
  }[] = [];

  const BATCH = 5;
  for (let i = 0; i < manuals.length; i += BATCH) {
    const batch = manuals.slice(i, i + BATCH);
    const checks = await Promise.all(
      batch.map(async (m) => {
        const ok = await checkUrl(m.pdfUrl!);
        return {
          id: m.id,
          brand: m.brand.name,
          manual: m.name,
          url: m.pdfUrl!,
          ok,
          wasBroken: m.isBroken,
        };
      })
    );
    results.push(...checks);
  }

  const now = new Date();
  const newlyBroken: { brand: string; manual: string; url: string }[] = [];
  let fixedCount = 0;
  let brokenCount = 0;

  for (const r of results) {
    if (!r.ok) {
      brokenCount++;
      if (!r.wasBroken) {
        newlyBroken.push({ brand: r.brand, manual: r.manual, url: r.url });
      }
      await prisma.manual.update({
        where: { id: r.id },
        data: { isBroken: true, lastValidated: now },
      });
    } else {
      if (r.wasBroken) fixedCount++;
      await prisma.manual.update({
        where: { id: r.id },
        data: { isBroken: false, lastValidated: now },
      });
    }
  }

  if (newlyBroken.length > 0) {
    await sendBrokenLinksAlert(newlyBroken);
  }

  return NextResponse.json({
    checked: results.length,
    broken: brokenCount,
    newlyBroken: newlyBroken.length,
    fixed: fixedCount,
    emailSent: newlyBroken.length > 0,
  });
}
