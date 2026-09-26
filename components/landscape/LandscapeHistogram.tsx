export type LandscapeBin = { key: string; label: string; count: number | null };

export function LandscapeHistogram({
  bins,
  total,
  caption,
}: {
  bins: LandscapeBin[];
  total: number | null;
  caption: string;
}) {
  const max = Math.max(0, ...bins.map((b) => b.count ?? 0));
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <h2 className="text-[13px] font-semibold text-ink">Criteria by predicate</h2>
        <span className="font-mono text-[11px] text-ink-3">
          {total === null ? "— trials compiled" : `${total} trials compiled`}
        </span>
      </div>
      <ul className="space-y-1.5 px-3 py-3 sm:px-4">
        {bins.map((b) => {
          const pct = b.count !== null && max > 0 ? (b.count / max) * 100 : 0;
          return (
            <li key={b.key} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2 text-[12px]">
              <span className="truncate text-ink-2">{b.label}</span>
              <span className="h-2 overflow-hidden rounded-sm bg-line-2">
                <span className="block h-full bg-ink-2" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-right font-mono text-ink">{b.count ?? "—"}</span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line-2 px-3 py-2 text-[11px] text-ink-3 sm:px-4">{caption}</p>
    </div>
  );
}
