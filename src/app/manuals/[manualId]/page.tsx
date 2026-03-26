import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ manualId: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { manualId } = await params;
  const manual = await prisma.manual.findUnique({
    where: { id: manualId },
    include: { brand: true },
  });
  if (!manual || !manual.pdfUrl) return {};

  return {
    title: `${manual.brand.name} — ${manual.name} | ErrorLib`,
    description: `Read the official ${manual.brand.name} ${manual.name} manual on ErrorLib.`,
    robots: { index: false },
  };
}

export default async function ManualViewerPage({ params, searchParams }: Props) {
  const { manualId } = await params;
  const { page } = await searchParams;

  const manual = await prisma.manual.findUnique({
    where: { id: manualId },
    include: {
      brand: true,
      _count: { select: { faultCodes: true } },
    },
  });

  if (!manual || !manual.pdfUrl || manual.isBroken) notFound();

  const proxySrc = `/api/pdf-proxy?id=${manualId}`;
  const pdfSrc = page ? `${proxySrc}#page=${page}` : proxySrc;

  const codesHref = `/${manual.brand.slug}/${manual.slug}`;

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center justify-between border-b border-technical-700 bg-technical-800 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-technical-100">
            {manual.brand.name} — {manual.name}
          </h1>
          {page && (
            <p className="text-xs text-technical-400">Page {page}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={codesHref}
            className="rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25"
          >
            Browse {manual._count.faultCodes} fault codes
          </a>
          <a
            href={manual.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-technical-600 px-3 py-1.5 text-xs text-technical-300 transition hover:border-technical-500 hover:text-white"
          >
            Open original
          </a>
        </div>
      </div>

      <iframe
        src={pdfSrc}
        className="flex-1 w-full bg-technical-900"
        title={`${manual.brand.name} ${manual.name}`}
      />
    </div>
  );
}
