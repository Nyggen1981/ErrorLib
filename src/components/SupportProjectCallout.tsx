/**
 * Discrete “support the site” block for fault pages — practical tone, not ad-like.
 */
export function SupportProjectCallout() {
  return (
    <section
      className="mt-8 border-t border-technical-600/35 pt-6"
      aria-labelledby="support-project-heading"
    >
      <div className="rounded-lg border border-technical-600/80 bg-technical-800/90 px-4 py-5 shadow-sm sm:px-5 sm:py-6">
        <h2
          id="support-project-heading"
          className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-technical-500"
        >
          Support the project
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-technical-200 sm:text-[15px]">
          Did this code save your shift? Support ErrorLib with a coffee! ☕️
        </p>
        <div className="mt-4 flex justify-center">
          <a
            href="https://buymeacoffee.com/errorlib"
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center justify-center rounded-md border border-accent/35 bg-accent/10 px-5 py-2.5 text-sm font-semibold tracking-tight text-accent transition hover:border-accent/55 hover:bg-accent/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Buy me a coffee
          </a>
        </div>
      </div>
    </section>
  );
}
