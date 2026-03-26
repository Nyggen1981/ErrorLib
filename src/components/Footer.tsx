import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
};

export function Footer({ locale }: Props) {
  return (
    <footer className="border-t border-technical-700 bg-technical-800">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="order-2 flex flex-col md:order-1 md:min-w-0 md:flex-1">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-technical-300 md:justify-start">
              <span>{t("footerTitle", locale)}</span>
              <span className="hidden text-technical-500 sm:inline">|</span>
              <a href="/about" className="transition hover:text-accent">
                About
              </a>
              <a href="/privacy" className="transition hover:text-accent">
                Privacy
              </a>
              <a href="/terms" className="transition hover:text-accent">
                Terms
              </a>
            </div>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] leading-relaxed text-technical-400 md:mx-0 md:text-left">
              {t("disclaimer", locale)}
            </p>
          </div>

          <div className="order-1 flex justify-center md:order-2 md:flex-shrink-0 md:justify-end md:pt-0.5">
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
      </div>
    </footer>
  );
}
