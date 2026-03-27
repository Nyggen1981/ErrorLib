import type { Metadata } from "next";
import { ContactEmail } from "@/components/ContactEmail";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "ErrorLib terms of service — conditions for using our industrial fault code reference.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-technical-50">
        Terms of Service
      </h1>
      <p className="mb-4 text-xs text-technical-400">
        Last updated: March 2026
      </p>

      <div className="prose prose-invert max-w-none space-y-4 text-sm text-technical-200 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-technical-50 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-technical-100">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing and using ErrorLib (errorlib.net), you agree to be bound
          by these Terms of Service. If you do not agree, please do not use the
          service.
        </p>

        <h2>2. Service Description</h2>
        <p>
          ErrorLib is an independent technical reference tool that provides fault
          code information, troubleshooting guides, and diagnostic data for
          industrial equipment. Content is compiled from publicly available
          manufacturer documentation and enhanced with AI-assisted analysis.
        </p>

        <h2>3. Disclaimer of Warranties</h2>
        <p>
          The information provided on ErrorLib is for reference purposes only and
          is provided &quot;as is&quot; without any warranties, express or implied.
        </p>
        <ul>
          <li>
            ErrorLib is <strong>not affiliated with, endorsed by, or
            sponsored by</strong> any equipment manufacturer.
          </li>
          <li>
            Fault code descriptions and solutions are derived from publicly
            available documentation and may not reflect the latest manufacturer
            updates.
          </li>
          <li>
            Always consult official manufacturer documentation and qualified
            technicians before performing maintenance or repairs.
          </li>
          <li>
            We do not guarantee the accuracy, completeness, or timeliness of any
            information on this site.
          </li>
        </ul>

        <h2>4. Limitation of Liability</h2>
        <p>
          ErrorLib, its owners, and contributors shall not be liable for any
          direct, indirect, incidental, consequential, or special damages
          arising from the use of or inability to use this service. This
          includes, but is not limited to, damages from equipment malfunction,
          personal injury, or downtime resulting from reliance on information
          provided here.
        </p>

        <h2>5. Professional Use</h2>
        <p>
          This service is intended for use by qualified industrial technicians,
          engineers, and maintenance professionals. Users should apply
          professional judgment and follow all applicable safety standards and
          regulations when performing any work based on information found here.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          All original content, design, and compilation of data on ErrorLib is
          our intellectual property. Individual fault code information and
          manufacturer-specific data remain the property of their respective
          owners. Our use of such data falls under fair use for technical
          reference purposes.
        </p>

        <h2>7. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>
            Scrape, crawl, or systematically download content for competing
            services
          </li>
          <li>
            Misrepresent ErrorLib content as official manufacturer documentation
          </li>
          <li>
            Attempt to access administrative or non-public areas of the service
          </li>
          <li>Interfere with the operation of the website</li>
        </ul>

        <h2>8. Modifications</h2>
        <p>
          We reserve the right to modify these terms at any time. Continued use
          after changes constitutes acceptance of the revised terms.
        </p>

        <h2>9. Governing Law</h2>
        <p>
          These terms are governed by the laws of Norway. Any disputes shall be
          resolved in Norwegian courts.
        </p>

        <h2>10. Contact</h2>
        <p>
          For questions about these terms, contact us at{" "}
          <ContactEmail display="legal@errorlib.net" />.
        </p>
      </div>
    </div>
  );
}
