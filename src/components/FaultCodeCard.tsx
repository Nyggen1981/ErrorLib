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
      className="group block rounded-xl border border-technical-200 bg-white p-5 transition-all hover:border-technical-300 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-3">
        <span className="rounded-md bg-technical-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
          {code}
        </span>
        <h3 className="font-semibold text-technical-800 group-hover:text-accent transition-colors">
          {title}
        </h3>
      </div>
      <p className="line-clamp-2 text-sm leading-relaxed text-technical-500">
        {description}
      </p>
    </a>
  );
}
