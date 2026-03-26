import "dotenv/config";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { washManualTitle } from "../src/lib/manual-title-wash.js";

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ExtractedCode = {
  code: string;
  title: string;
  description: string;
  fixSteps: string[];
};

type ExtractionResult = {
  codes: ExtractedCode[];
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function extractFromImage(imagePath: string): Promise<ExtractionResult> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all fault codes, their meanings, and fix steps from this manual page.
Format as JSON: { "codes": [{ "code": "F0001", "title": "...", "description": "...", "fixSteps": ["step1", "step2"] }] }
Only return valid JSON, no markdown fences or extra text.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  return JSON.parse(raw) as ExtractionResult;
}

async function processManual(
  brandName: string,
  manualName: string,
  imagePaths: string[],
  options?: { pdfUrl?: string; imageUrl?: string }
) {
  const brandSlug = slugify(brandName);
  const cleanManualName = washManualTitle(manualName);
  const manualSlug = slugify(cleanManualName);

  const brand = await prisma.brand.upsert({
    where: { slug: brandSlug },
    update: { name: brandName },
    create: { name: brandName, slug: brandSlug },
  });

  const manual = await prisma.manual.upsert({
    where: { slug: manualSlug },
    update: {
      name: cleanManualName,
      pdfUrl: options?.pdfUrl,
      imageUrl: options?.imageUrl,
    },
    create: {
      name: cleanManualName,
      slug: manualSlug,
      brandId: brand.id,
      pdfUrl: options?.pdfUrl,
      imageUrl: options?.imageUrl,
    },
  });

  console.log(`Processing ${brandName} ${cleanManualName}...`);
  let totalCodes = 0;

  for (const imgPath of imagePaths) {
    console.log(`  Analyzing: ${path.basename(imgPath)}`);
    const result = await extractFromImage(imgPath);

    for (const fc of result.codes) {
      const faultSlug = slugify(`${fc.code}-${fc.title}`);
      await prisma.faultCode.upsert({
        where: { slug: faultSlug },
        update: {
          title: fc.title,
          description: fc.description,
          fixSteps: fc.fixSteps,
        },
        create: {
          code: fc.code,
          slug: faultSlug,
          title: fc.title,
          description: fc.description,
          fixSteps: fc.fixSteps,
          manualId: manual.id,
        },
      });
      totalCodes++;
      console.log(`    Extracted: ${fc.code} - ${fc.title}`);
    }
  }

  console.log(`Done! ${totalCodes} fault codes saved for ${manualName}.`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: npm run process-manual -- <brand> <manual> <image1> [image2] ...

Example:
  npm run process-manual -- "ABB" "ACS550" ./manuals/acs550-page1.png ./manuals/acs550-page2.png
`);
    process.exit(1);
  }

  const [brandName, manualName, ...images] = args;

  for (const img of images) {
    if (!fs.existsSync(img)) {
      console.error(`File not found: ${img}`);
      process.exit(1);
    }
  }

  await processManual(brandName, manualName, images);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
