import { PrismaClient } from "../../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const adapter = new PrismaNeon({
      connectionString: process.env.DATABASE_URL!,
    });
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

export async function disconnect() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function upsertBrand(name: string) {
  const prisma = getPrisma();
  return prisma.brand.upsert({
    where: { slug: slugify(name) },
    update: { name },
    create: { name, slug: slugify(name) },
  });
}

export async function upsertManual(
  brandId: string,
  name: string,
  pdfUrl?: string
) {
  const prisma = getPrisma();
  return prisma.manual.upsert({
    where: { slug: slugify(name) },
    update: { name, pdfUrl },
    create: {
      name,
      slug: slugify(name),
      brandId,
      pdfUrl,
    },
  });
}

export async function upsertFaultCode(
  manualId: string,
  code: string,
  title: string,
  description: string,
  fixSteps: string[]
) {
  const prisma = getPrisma();
  const slug = slugify(`${code}-${title}`);
  return prisma.faultCode.upsert({
    where: { slug },
    update: { title, description, fixSteps },
    create: {
      code,
      slug,
      title,
      description,
      fixSteps,
      manualId,
    },
  });
}
