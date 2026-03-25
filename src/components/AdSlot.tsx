export function AdSlot({
  slot,
  className = "",
}: {
  slot: "sidebar" | "content";
  className?: string;
}) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-dashed border-technical-600 bg-technical-800/50 ${className}`}
      data-ad-slot={slot}
    >
      <div className="flex items-center justify-center px-4 py-6 text-[10px] uppercase tracking-wider text-technical-400">
        Advertisement
      </div>
    </div>
  );
}
