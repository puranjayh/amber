import type { EquityView } from "./equity";

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function EquityBars({ view, sizes }: { view: EquityView; sizes: Record<string, number> }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <h2 className="text-[13px] font-semibold text-ink">Exclusion rate by subgroup</h2>
        <span className="font-mono text-[11px] text-ink-3">sorted by largest gap</span>
      </div>
      <ul>
        {view.rows.map((row) => (
          <li key={row.criterionId} className="border-b border-line-2 px-3 py-3 last:border-b-0 sm:px-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[12px] font-medium text-ink">{row.criterionId}</span>
                <span className="text-[13px] text-ink">{row.label}</span>
              </div>
              <span className="font-mono text-[11px] text-ink-2">
                gap <span className="font-medium text-ink">{row.maxGapPoints}</span> pts
              </span>
            </div>
            {row.maxGapPoints > 0 && (
              <p className="mt-0.5 text-[11px] text-ink-3">
                Excludes {row.worst} most, {row.best} least.
              </p>
            )}
            <ul className="mt-2 space-y-1">
              {view.subgroups.map((g) => {
                const rate = row.exclusionRateBySubgroup[g];
                const width = rate !== undefined && view.maxRate > 0 ? (rate / view.maxRate) * 100 : 0;
                const worst = row.maxGapPoints > 0 && g === row.worst;
                return (
                  <li key={g} className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-2 text-[11px] sm:grid-cols-[12rem_1fr_3rem]">
                    <span className={`truncate ${worst ? "font-medium text-ink" : "text-ink-2"}`} title={g}>
                      {g} <span className="font-mono text-ink-3">n={sizes[g] ?? 0}</span>
                    </span>
                    <span className="h-2 overflow-hidden rounded-sm bg-line-2">
                      <span
                        className={`block h-full ${worst ? "bg-ink" : "bg-ink-3"}`}
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-ink">{rate === undefined ? "—" : pct(rate)}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
