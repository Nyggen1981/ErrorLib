import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { Metadata } from "next";

type Props = {
  params: Promise<{
    brandSlug: string;
    manualSlug: string;
    faultSlug: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brandSlug, manualSlug, faultSlug } = await params;
  const fault = await prisma.faultCode.findUnique({
    where: { slug: faultSlug },
    include: { manual: { include: { brand: true } } },
  });
  if (
    !fault ||
    fault.manual.slug !== manualSlug ||
    fault.manual.brand.slug !== brandSlug
  )
    return {};

  const title = `How to fix ${fault.manual.brand.name} ${fault.manual.name} ${fault.code} - ${fault.title}`;
  return {
    title,
    description: fault.description.slice(0, 160),
    openGraph: {
      title,
      description: fault.description.slice(0, 160),
      type: "article",
    },
  };
}

export default async function FaultCodePage({ params }: Props) {
  const { brandSlug, manualSlug, faultSlug } = await params;
  const fault = await prisma.faultCode.findUnique({
    where: { slug: faultSlug },
    include: { manual: { include: { brand: true } } },
  });

  if (
    !fault ||
    fault.manual.slug !== manualSlug ||
    fault.manual.brand.slug !== brandSlug
  )
    notFound();

  const fixSteps = fault.fixSteps;
  const prioritySteps = fixSteps.slice(0, 3);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          {
            label: fault.manual.brand.name,
            href: `/${fault.manual.brand.slug}`,
          },
          {
            label: fault.manual.name,
            href: `/${fault.manual.brand.slug}/${fault.manual.slug}`,
          },
          { label: fault.code },
        ]}
      />

      {/* Hero */}
      <section className="mb-8 rounded-2xl border border-technical-200 bg-white p-6 sm:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-technical-900 sm:h-24 sm:w-24">
            <span className="font-mono text-2xl font-bold text-white sm:text-3xl">
              {fault.code}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              {fault.title}
            </h1>
            <p className="mt-1 text-sm text-technical-400">
              {fault.manual.brand.name} &middot; {fault.manual.name}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Quick Action Card */}
        <aside className="lg:col-span-1">
          <div className="sticky top-8 rounded-2xl border-2 border-accent bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg
                className="h-5 w-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
              <h2 className="text-lg font-bold text-accent">Priority Fix</h2>
            </div>
            <p className="mb-4 text-sm text-technical-500">
              Start with these steps to resolve the issue quickly:
            </p>
            <ol className="space-y-3">
              {prioritySteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-technical-700">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            {fixSteps.length > 3 && (
              <p className="mt-4 text-xs text-technical-400">
                + {fixSteps.length - 3} more steps below
              </p>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Description */}
          <section className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
            <h2 className="mb-4 text-xl font-bold">What does {fault.code} mean?</h2>
            <p className="leading-relaxed text-technical-600">
              {fault.description}
            </p>
          </section>

          {/* Full Troubleshooting Steps */}
          <section className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold">
              Complete Troubleshooting Guide
            </h2>
            <ol className="space-y-4">
              {fixSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4 rounded-lg border border-technical-100 bg-technical-50 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-technical-900 font-mono text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="pt-1 leading-relaxed text-technical-700">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
