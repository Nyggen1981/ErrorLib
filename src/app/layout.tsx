import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://errorlib.net"),
  title: {
    default: "ErrorLib - Industrial Fault Code Library",
    template: "%s | ErrorLib",
  },
  description:
    "Comprehensive fault code database for industrial equipment. Quick troubleshooting guides for ABB, Siemens, Danfoss drives and more.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "ErrorLib",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
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
            <div className="flex items-center gap-6 text-sm">
              <a
                href="/"
                className="text-technical-300 transition-colors hover:text-white"
              >
                Brands
              </a>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="bg-technical-900 text-technical-500">
          <div className="mx-auto max-w-6xl px-4 py-5 text-center text-xs sm:px-6">
            <p>ErrorLib &mdash; Industrial Fault Code Library</p>
            <p className="mx-auto mt-3 max-w-3xl text-[11px] leading-relaxed text-technical-600">
              Disclaimer: ErrorLib is an independent technical reference tool.
              While we aim for accuracy, always verify with the
              manufacturer&apos;s official service manuals before performing
              maintenance on industrial equipment. ErrorLib is not affiliated
              with the brands listed.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
