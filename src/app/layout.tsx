import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLocale, getActiveLanguages } from "@/lib/locale";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HreflangTags } from "@/components/HreflangTags";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://errorlib.net"),
  title: {
    default: "ErrorLib — Industrial Fault Code Library | Troubleshooting Guides",
    template: "%s | ErrorLib",
  },
  description:
    "Comprehensive fault code database for industrial equipment. Step-by-step troubleshooting guides for ABB, Siemens, Danfoss, Yaskawa drives, PLCs, and controllers.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "ErrorLib",
  },
  alternates: {
    canonical: "/",
  },
  other: {
    "google-site-verification": "",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const activeLanguages = await getActiveLanguages();

  return (
    <html lang={locale}>
      <head>
        <HreflangTags activeLanguages={activeLanguages} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-technical-50 text-technical-900 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "ErrorLib",
              url: "https://errorlib.net",
              description: "Industrial Fault Code Library with troubleshooting guides for ABB, Siemens, Danfoss, Yaskawa and more.",
              publisher: {
                "@type": "Organization",
                name: "ErrorLib",
                url: "https://errorlib.net",
              },
            }),
          }}
        />
        <header className="bg-technical-900">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <a href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                <span className="font-mono text-sm font-bold text-white">
                  EL
                </span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-white">
                ErrorLib
              </span>
            </a>
            <div className="flex items-center gap-4 sm:gap-6">
              <a
                href="/"
                className="text-sm text-technical-300 transition-colors hover:text-white"
              >
                {t("brands", locale)}
              </a>
              <LanguageSwitcher current={locale} activeLanguages={activeLanguages} />
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="bg-technical-900 text-technical-500">
          <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs sm:px-6">
            <p>{t("footerTitle", locale)}</p>
            <p className="mx-auto mt-3 max-w-3xl text-[11px] leading-relaxed text-technical-600">
              {t("disclaimer", locale)}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
