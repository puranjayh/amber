import type { ClaimsCoverage, PredicateCoverage } from "./coverage";
import { assertSlideCoverage, pct1 } from "./coverage";

const CHART_ORDER = [
  "prior_therapy",
  "comorbidity",
  "diagnosis",
  "age",
  "lab_value",
  "biomarker",
  "performance_status",
  "staging",
];

function barWidth(rate: number) {
  return `${Math.max(rate * 100, rate === 0 ? 0 : 0)}%`;
}

function Row({ row }: { row: PredicateCoverage }) {
  const ink = row.kind === "certain" && row.rate >= 0.8;
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.75rem] items-center gap-2 text-[13px] sm:grid-cols-[10rem_1fr_3rem]">
      <span className="truncate font-mono text-ink-2" title={row.predicate}>
        {row.predicate}
      </span>
      <span className="h-2 overflow-hidden rounded-sm bg-line-2">
        <span
          className={`block h-full ${ink ? "bg-ink" : "bg-ink-3"}`}
          style={{ width: barWidth(row.rate) }}
        />
      </span>
      <span className={`text-right font-mono ${ink ? "font-medium text-ink" : "text-ink-3"}`}>
        {pct1(row.rate)}
      </span>
    </li>
  );
}

export function CoverageChart({ coverage }: { coverage: ClaimsCoverage }) {
  assertSlideCoverage(coverage, coverage.source);
  const shown = CHART_ORDER.map((predicate) =>
    coverage.byPredicate.find((row) => row.predicate === predicate),
  ).filter((row): row is PredicateCoverage => row !== undefined);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="px-3 py-3 sm:px-4">
        <p className="text-[11px] font-medium text-ink-3">Lower bound · conservative</p>
        <p className="mt-1 font-mono text-[24px] font-medium leading-none text-ink">
          {pct1(coverage.lowerRate)}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink">
          of {coverage.criteria.toLocaleString("en-US")} criteria across {coverage.trials} real
          trials are answerable from claims.
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          {coverage.ambiguous.toLocaleString("en-US")} ambiguous criteria (washout,
          contraindication) are counted as requiring a chart, so {pct1(coverage.lowerRate)} is the
          lower bound. The upper bound is {pct1(coverage.upperRate)}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
        <div className="bg-surface px-3 py-2.5 sm:px-4">
          <div className="font-mono text-[18px] font-medium leading-none text-ink">
            {pct1(coverage.exclusions.rate)}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">exclusions — claims rule out</div>
        </div>
        <div className="bg-surface px-3 py-2.5 sm:px-4">
          <div className="font-mono text-[18px] font-medium leading-none text-ink">
            {pct1(coverage.inclusions.rate)}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">inclusions — almost never rule in</div>
        </div>
      </div>

      <ul className="space-y-1.5 border-t border-line px-3 py-3 sm:px-4">
        {shown.map((row) => (
          <Row key={row.predicate} row={row} />
        ))}
      </ul>
      <p className="border-t border-line-2 px-3 py-2 text-[11px] text-ink-3 sm:px-4">
        Claims rule people out cheaply and almost never rule anyone in. {coverage.source}.
      </p>
    </div>
  );
}
