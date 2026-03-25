import type { Metadata } from "next";
import { ContactEmail } from "@/components/ContactEmail";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "ErrorLib privacy policy — how we collect, use, and protect your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-6 text-sm text-technical-500">
        Last updated: March 2026
      </p>

      <div className="prose prose-technical max-w-none space-y-6 text-technical-700 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-technical-900 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
        <h2>1. Introduction</h2>
        <p>
          ErrorLib (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates errorlib.net, an industrial fault code
          reference library. This Privacy Policy explains how we collect, use,
          and protect information when you use our website.
        </p>

        <h2>2. Information We Collect</h2>
        <p>We collect minimal information to operate and improve the service:</p>
        <ul>
          <li>
            <strong>Search queries</strong> — We log search terms to understand
            what technicians need and improve our database coverage. Search logs
            do not contain personally identifiable information.
          </li>
          <li>
            <strong>Brand requests</strong> — When you submit a request for a
            new brand or manual, we store the brand name, model, and your email
            address (if voluntarily provided) to notify you when the content is
            available.
          </li>
          <li>
            <strong>Cookies</strong> — We use a single cookie to store your
            language preference. No tracking cookies are used.
          </li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To provide and improve our fault code reference service</li>
          <li>To identify gaps in our documentation coverage</li>
          <li>
            To send you a one-time email notification if you requested a brand
            and provided your email
          </li>
          <li>To generate aggregate, anonymous usage statistics</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>
          We do not sell, trade, or rent your personal information. We may share
          anonymized, aggregate data for analytical purposes. Our service uses
          the following third-party providers:
        </p>
        <ul>
          <li>Vercel — hosting and deployment</li>
          <li>Neon — database hosting (PostgreSQL)</li>
          <li>Resend — transactional email delivery</li>
          <li>Google Gemini — AI-powered content analysis</li>
        </ul>

        <h2>5. Data Retention</h2>
        <p>
          Search logs are retained for analytical purposes. Email addresses
          provided in brand requests are retained until the notification is sent,
          after which they may be removed. You may request deletion of your data
          at any time by contacting us.
        </p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Request access to any personal data we hold about you</li>
          <li>Request correction or deletion of your data</li>
          <li>Withdraw consent for email communications</li>
        </ul>

        <h2>7. Security</h2>
        <p>
          We implement industry-standard security measures to protect data
          transmitted to and stored on our servers. All connections use HTTPS
          encryption.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Changes will be posted on
          this page with an updated revision date.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about this privacy policy, contact us at{" "}
          <ContactEmail display="privacy@errorlib.net" />.
        </p>
      </div>
    </div>
  );
}
