import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-technical-50 text-technical-900 antialiased">
        <header className="border-b border-technical-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-technical-900">
                <span className="font-mono text-sm font-bold text-white">
                  EL
                </span>
              </div>
              <span className="text-lg font-semibold tracking-tight">
                ErrorLib
              </span>
            </a>
            <div className="flex items-center gap-6 text-sm text-technical-500">
              <a
                href="/"
                className="transition-colors hover:text-technical-900"
              >
                Brands
              </a>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-technical-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-technical-400 sm:px-6">
            ErrorLib &mdash; Industrial Fault Code Reference
          </div>
        </footer>
      </body>
    </html>
  );
}
