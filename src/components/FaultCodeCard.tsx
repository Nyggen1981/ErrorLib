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
      className="group block overflow-hidden rounded-xl border border-technical-200 bg-white p-5 transition-all hover:border-technical-300 hover:shadow-md"
    >
      <div className="mb-2 flex min-w-0 items-center gap-3">
        <span
          className={`shrink-0 whitespace-nowrap rounded-md bg-technical-900 px-3 py-1 font-mono font-bold text-white ${
            code.length > 8 ? "text-xs" : code.length > 5 ? "text-sm" : "text-sm"
          }`}
        >
          {code}
        </span>
        <h3 className="min-w-0 truncate font-semibold text-technical-800 group-hover:text-accent transition-colors">
          {title}
        </h3>
      </div>
      <p className="line-clamp-2 break-words text-sm leading-relaxed text-technical-500">
        {description}
      </p>
    </a>
  );
}
