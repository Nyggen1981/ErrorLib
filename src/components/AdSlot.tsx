export function AdSlot({
  slot,
  className = "",
}: {
  slot: "sidebar" | "content" | "viewer-footer";
  className?: string;
}) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;

  if (slot === "viewer-footer") {
    return (
      <div
        className={`border-t border-technical-700 bg-technical-900 ${className}`}
        data-ad-slot={slot}
      >
        <div className="mx-auto flex flex-col items-center py-2">
          <span className="mb-1 text-[9px] uppercase tracking-widest text-technical-500">
            Sponsored
          </span>
          {/* 320x50 mobile / 728x90 desktop — standard IAB leaderboard */}
          <div className="hidden sm:block">
            <div className="flex h-[90px] w-[728px] items-center justify-center rounded border border-dashed border-technical-600 bg-technical-800/60 text-[10px] uppercase tracking-wider text-technical-500">
              Ad &mdash; 728 &times; 90
            </div>
          </div>
          <div className="sm:hidden">
            <div className="flex h-[50px] w-[320px] items-center justify-center rounded border border-dashed border-technical-600 bg-technical-800/60 text-[10px] uppercase tracking-wider text-technical-500">
              Ad &mdash; 320 &times; 50
            </div>
          </div>
        </div>
      </div>
    );
  }

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
