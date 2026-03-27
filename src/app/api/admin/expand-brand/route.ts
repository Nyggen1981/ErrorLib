import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const brand = req.nextUrl.searchParams.get("brand")?.trim();
  if (!brand) {
    return NextResponse.json(
      { error: "brand query param is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const existingManuals = await prisma.manual.findMany({
    where: { brand: { name: { equals: brand, mode: "insensitive" } } },
    select: { name: true },
  });
  const existingNames = existingManuals.map((m) => m.name);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an industrial automation expert. For the brand "${brand}", identify the top 10 most common industrial product series that technicians frequently need fault code documentation for.

These are product SERIES/FAMILIES (like "ACS580", "SINAMICS G120", "FR-D700"), NOT individual fault codes.

Focus on: Variable Frequency Drives (VFDs), PLCs, Servo Drives, Softstarters, HMIs, Motion Controllers, and Inverters.

We already have documentation for these products — EXCLUDE them:
${existingNames.length > 0 ? existingNames.map((n) => `- ${n}`).join("\n") : "(none yet)"}

Return EXACTLY a JSON array of objects, no markdown fences, no explanation:
[{"series":"MODEL_SERIES_NAME","category":"PRODUCT_CATEGORY","reason":"One sentence why this is important"}]

Example:
[{"series":"ACS880","category":"Variable Frequency Drive","reason":"ABB flagship industrial drive with advanced fault diagnostics"},{"series":"AC500","category":"PLC","reason":"Widely deployed ABB PLC platform in process automation"}]

Return ONLY the JSON array.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const suggestions = JSON.parse(cleaned) as {
      series: string;
      category: string;
      reason: string;
    }[];

    return NextResponse.json({ brand, existing: existingNames, suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `AI research failed: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return unauthorized();

  const body = await req.json();
  const { brand, series } = body as {
    brand?: string;
    series?: string[];
  };

  if (!brand || !series || series.length === 0) {
    return NextResponse.json(
      { error: "brand and series[] are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.miningQueue.findFirst({
    where: {
      brandName: { equals: brand, mode: "insensitive" },
      status: { in: ["pending", "processing"] },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: `"${brand}" already has an active queue entry. Wait for it to complete first.` },
      { status: 409 }
    );
  }

  const item = await prisma.miningQueue.create({
    data: {
      brandName: brand,
      status: "pending",
      targetManuals: series,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
