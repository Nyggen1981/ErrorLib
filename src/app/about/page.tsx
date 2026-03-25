import type { Metadata } from "next";
import { ContactEmail } from "@/components/ContactEmail";

export const metadata: Metadata = {
  title: "About ErrorLib",
  description:
    "ErrorLib is an independent industrial fault code library built for technicians and engineers.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">
        About ErrorLib
      </h1>

      <div className="space-y-6 text-technical-700 leading-relaxed">
        <p className="text-lg">
          ErrorLib is an independent technical reference library for industrial
          fault codes. We help field technicians, maintenance engineers, and
          automation professionals quickly diagnose and resolve equipment faults.
        </p>

        <div className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
          <h2 className="mb-4 text-xl font-semibold text-technical-900">
            What We Do
          </h2>
          <p className="mb-4">
            Industrial equipment — variable frequency drives, PLCs, servo
            drives, softstarters — generates fault codes when something goes
            wrong. Finding the right troubleshooting information often means
            searching through hundreds of pages of manufacturer documentation.
          </p>
          <p>
            ErrorLib compiles and indexes fault codes from publicly available
            manufacturer manuals, making them instantly searchable. Every fault
            code entry includes a clear description and step-by-step
            troubleshooting instructions written for field technicians.
          </p>
        </div>

        <div className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
          <h2 className="mb-4 text-xl font-semibold text-technical-900">
            Our Coverage
          </h2>
          <p className="mb-4">
            We currently cover major industrial automation brands including ABB,
            Siemens, Danfoss, Yaskawa, Schneider Electric, Vacon, SEW
            Eurodrive, Allen-Bradley, and more. Our database is continuously
            expanding based on user requests and industry demand.
          </p>
          <p>
            Missing a brand or manual? Use our{" "}
            <a href="/#request" className="text-accent hover:underline">
              request form
            </a>{" "}
            and our indexing team will prioritize it.
          </p>
        </div>

        <div className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
          <h2 className="mb-4 text-xl font-semibold text-technical-900">
            For Professionals
          </h2>
          <p className="mb-4">
            ErrorLib is built for qualified professionals who work with
            industrial equipment daily. Our content is designed to be practical
            and actionable — not theoretical. Every troubleshooting step is
            something a technician can do on-site.
          </p>
          <p className="text-sm text-technical-500">
            ErrorLib is not affiliated with or endorsed by any equipment
            manufacturer. Always consult official documentation and follow
            applicable safety standards when performing maintenance or repairs.
          </p>
        </div>

        <div className="rounded-2xl border border-technical-200 bg-white p-6 sm:p-8">
          <h2 className="mb-4 text-xl font-semibold text-technical-900">
            Contact
          </h2>
          <p>
            For inquiries, partnerships, or feedback, reach us at{" "}
            <ContactEmail display="contact@errorlib.net" />.
          </p>
        </div>
      </div>
    </div>
  );
}
