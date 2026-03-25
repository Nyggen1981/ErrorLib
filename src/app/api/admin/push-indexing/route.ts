import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import crypto from "crypto";

const BASE_URL = process.env.SITE_URL || "https://errorlib.net";
const BATCH_SIZE = 100;

function isAdmin(token: string | undefined): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !token) return false;
  const expected = crypto.createHmac("sha256", pw).update("errorlib-admin").digest("hex");
  return token === expected;
}

function getAuth() {
  const keyJson = process.env.GOOGLE_INDEXING_KEY;
  if (!keyJson) return null;

  const key = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  });
}

export async function GET() {
  const jar = await cookies();
  if (!isAdmin(jar.get("admin_token")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const total = await prisma.faultCode.count();
  const indexed = await prisma.faultCode.count({ where: { isIndexed: true } });

  return NextResponse.json({ total, indexed, remaining: total - indexed });
}

export async function POST() {
  const jar = await cookies();
  if (!isAdmin(jar.get("admin_token")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "GOOGLE_INDEXING_KEY not configured" },
      { status: 500 }
    );
  }

  const codes = await prisma.faultCode.findMany({
    where: { isIndexed: false },
    orderBy: { createdAt: "desc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      slug: true,
      manual: {
        select: {
          slug: true,
          brand: { select: { slug: true } },
        },
      },
    },
  });

  if (codes.length === 0) {
    return NextResponse.json({ pushed: 0, failed: 0, remaining: 0, done: true });
  }

  const indexing = google.indexing({ version: "v3", auth });
  let pushed = 0;
  let failed = 0;
  const successIds: string[] = [];

  for (const fc of codes) {
    const url = `${BASE_URL}/${fc.manual.brand.slug}/${fc.manual.slug}/${fc.slug}`;
    try {
      await indexing.urlNotifications.publish({
        requestBody: { url, type: "URL_UPDATED" },
      });
      successIds.push(fc.id);
      pushed++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (successIds.length > 0) {
    await prisma.faultCode.updateMany({
      where: { id: { in: successIds } },
      data: { isIndexed: true },
    });
  }

  // Ping sitemap
  try {
    const sitemap = `${BASE_URL}/sitemap.xml`;
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemap)}`);
    await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemap)}`);
  } catch {}

  const remaining = await prisma.faultCode.count({ where: { isIndexed: false } });

  return NextResponse.json({ pushed, failed, remaining, done: remaining === 0 });
}
