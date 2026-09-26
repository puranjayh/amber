import type { CriteriaLandscape, LandscapeAnalyte } from "@/app/_data/schema";
import { dominantThreshold, hasConsensus, primaryOperator, thresholdHeadline } from "./build";

const GLYPH: Record<string, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  "==": "=",
  "!=": "≠",
};
const SHOW = 20;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function glyph(op: string) {
  return GLYPH[op] ?? op;
}

function splits(landscape: CriteriaLandscape) {
  return landscape.analytes
    .map((row) => {
      const op = primaryOperator(row.operators);
      if (!op || hasConsensus(op.thresholds)) return null;
      return {
        analyte: row.analyte,
        operator: op.operator,
        headline: thresholdHeadline(op.thresholds),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 4);
}

function Thresholds({
  thresholds,
}: {
  thresholds: { threshold: number; count: number; percentage: number }[];
}) {
  const dominant = dominantThreshold(thresholds);
  const shown = [...thresholds]
    .sort((a, b) => b.count - a.count || a.threshold - b.threshold)
    .slice(0, 5);
  return (
    <ul className="mt-1.5 space-y-1.5">
      {shown.map((t) => {
        const lead = dominant && t.threshold === dominant.threshold;
        return (
          <li
            key={t.threshold}
            className="grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 text-[13px]"
          >
            <span
              className={`font-mono tabular-nums ${lead ? "font-medium text-ink" : "text-ink-3"}`}
            >
              {t.threshold}
            </span>
            <span className="h-2.5 overflow-hidden rounded-sm bg-line-2">
              <span
                className={`block h-full ${lead ? "bg-ink" : "bg-ink-3"}`}
                style={{ width: `${Math.max(2, t.percentage * 100)}%` }}
              />
            </span>
            <span
              className={`text-right font-mono tabular-nums ${lead ? "font-medium text-ink" : "text-ink-3"}`}
            >
              {pct(t.percentage)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AnalyteRow({ row }: { row: LandscapeAnalyte }) {
  const operators = [...row.operators].sort((a, b) => b.totalTrials - a.totalTrials);
  const primary = operators[0];
  return (
    <li className="px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-[13px] font-medium text-ink">
          {row.analyte}
          {primary && (
            <span className="ml-1.5 font-normal text-ink-3">{glyph(primary.operator)}</span>
          )}
        </h3>
        <span className="font-mono text-[11px] text-ink-3">
          {row.totalTrials} trial{row.totalTrials === 1 ? "" : "s"}
        </span>
      </div>
      {primary && (
        <p
          className={`mt-0.5 text-[13px] ${hasConsensus(primary.thresholds) ? "text-ink-2" : "font-medium text-ink"}`}
        >
          {thresholdHeadline(primary.thresholds)}
        </p>
      )}
      {operators
        .filter((op, i) => i === 0 || op.totalTrials >= row.totalTrials * 0.15)
        .map((op) => (
          <div key={op.operator} className={op === primary ? "" : "mt-2.5"}>
            {operators.length > 1 && (
              <div className="font-mono text-[11px] text-ink-3">
                {glyph(op.operator)} · {op.totalTrials} trial{op.totalTrials === 1 ? "" : "s"}
              </div>
            )}
            <Thresholds thresholds={op.thresholds} />
          </div>
        ))}
    </li>
  );
}

export function LandscapeHistogram({
  landscape,
  caption,
}: {
  landscape: CriteriaLandscape;
  caption: string;
}) {
  const shown = landscape.analytes.slice(0, SHOW);
  const rest = landscape.analytes.length - shown.length;
  const noConsensus = splits(landscape);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <h2 className="text-[18px] font-medium text-ink">Thresholds by analyte</h2>
        <span className="font-mono text-[11px] text-ink-3">
          {landscape.generatedFromTrials} trials compiled
        </span>
      </div>
      {noConsensus.length > 0 && (
        <div className="border-b border-line-2 bg-canvas px-3 py-2.5 sm:px-4">
          <div className="text-[11px] font-medium text-ink-3">No consensus exists</div>
          <ul className="mt-1 space-y-0.5">
            {noConsensus.map((row) => (
              <li key={row.analyte} className="text-[13px] text-ink">
                <span className="font-mono font-medium">{row.analyte}</span>
                <span className="ml-1.5 text-ink-3">{glyph(row.operator)}</span>
                <span className="ml-1.5">{row.headline}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {landscape.analytes.length === 0 ? (
        <p className="px-3 py-6 text-[13px] text-ink-2 sm:px-4">
          No numeric leaves in the compiled corpus yet. The chart lights up when compiler:validate
          writes analytes into data/compiled/landscape.json.
        </p>
      ) : (
        <ol className="divide-y divide-line-2">
          {shown.map((row) => (
            <AnalyteRow key={row.analyte} row={row} />
          ))}
        </ol>
      )}
      <p className="border-t border-line-2 px-3 py-2 text-[11px] text-ink-3 sm:px-4">
        {caption}
        {rest > 0 &&
          ` · showing the ${shown.length} most-used of ${landscape.analytes.length} analytes.`}
      </p>
    </div>
  );
}
