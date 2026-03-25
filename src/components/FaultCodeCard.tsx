type FaultCodeCardProps = {
  code: string;
  title: string;
  description: string;
  href: string;
};

export function FaultCodeCard({
  code,
  title,
  description,
  href,
}: FaultCodeCardProps) {
  return (
    <a
      href={href}
      className="group block overflow-hidden rounded-lg border border-technical-700 bg-technical-800 p-4 transition-all hover:border-technical-500 hover:bg-technical-700"
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-3">
        <span
          className={`shrink-0 whitespace-nowrap rounded bg-accent/15 px-2.5 py-0.5 font-mono font-bold text-accent ${
            code.length > 8 ? "text-xs" : "text-sm"
          }`}
        >
          {code}
        </span>
        <h3 className="min-w-0 truncate font-semibold text-technical-50 transition-colors group-hover:text-accent">
          {title}
        </h3>
      </div>
      <p className="line-clamp-2 break-words text-sm leading-relaxed text-technical-300">
        {description}
      </p>
    </a>
  );
}
