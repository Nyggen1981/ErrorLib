import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
};

export function Footer({ locale }: Props) {
  return (
    <footer className="w-full border-t border-technical-700 bg-technical-800 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-center text-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <nav
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-technical-300"
              aria-label="Footer"
            >
              <a href="/about" className="transition hover:text-accent">
                About
              </a>
              <span className="text-technical-600" aria-hidden>
                ·
              </span>
              <a href="/privacy" className="transition hover:text-accent">
                Privacy
              </a>
              <span className="text-technical-600" aria-hidden>
                ·
              </span>
              <a href="/terms" className="transition hover:text-accent">
                Terms
              </a>
            </nav>
            <p className="max-w-2xl text-xs text-technical-400">
              {t("footerTitle", locale)}
            </p>
          </div>

          <p className="max-w-2xl text-[10px] leading-relaxed text-technical-400">
            {t("disclaimer", locale)}
          </p>

          <a
            href="https://buymeacoffee.com/errorlib"
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center justify-center rounded-md border border-technical-500 bg-technical-700 px-4 py-2 text-sm font-medium text-technical-100 shadow-sm transition hover:border-technical-400 hover:bg-technical-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-technical-400"
          >
            Buy me a coffee ☕️
          </a>
        </div>
      </div>
    </footer>
  );
}
