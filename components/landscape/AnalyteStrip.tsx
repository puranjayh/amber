import type { LandscapeAnalyte } from "@/app/_data/schema";
import { dominantThreshold, hasConsensus, primaryOperator, thresholdHeadline } from "./build";

const GLYPH: Record<string, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  "==": "=",
  "!=": "≠",
};

export function matchAnalyte(
  analytes: LandscapeAnalyte[],
  family: RegExp,
): LandscapeAnalyte | undefined {
  const hits = analytes.filter((a) => family.test(a.analyte.trim()));
  return [...hits].sort((a, b) => b.totalTrials - a.totalTrials)[0];
}

export function AnalyteStrip({
  analyte,
  caption,
}: {
  analyte: LandscapeAnalyte | undefined;
  caption: string;
}) {
  if (!analyte) {
    return (
      <div className="rounded-md border border-line bg-surface px-4 py-6">
        <p className="text-[15px] font-medium text-ink">Not generated yet</p>
        <p className="mt-1 text-[13px] text-ink-2">No corpus distribution for this analyte.</p>
      </div>
    );
  }
  const primary = primaryOperator(analyte.operators);
  const shown = primary
    ? [...primary.thresholds]
        .sort((a, b) => b.count - a.count || a.threshold - b.threshold)
        .slice(0, 6)
    : [];
  const lead = primary ? dominantThreshold(primary.thresholds) : undefined;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <h2 className="text-[18px] font-medium text-ink">Nobody agrees on this number</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {analyte.analyte}
          {primary && (
            <span className="ml-1.5 font-mono text-ink-3">
              {GLYPH[primary.operator] ?? primary.operator}
            </span>
          )}
          {primary && ` · ${thresholdHeadline(primary.thresholds)}`}
        </p>
      </div>
      <ul className="space-y-1.5 px-3 py-3 sm:px-4">
        {shown.map((t) => {
          const top = lead && t.threshold === lead.threshold;
          return (
            <li
              key={t.threshold}
              className="grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 text-[13px]"
            >
              <span
                className={`font-mono tabular-nums ${top ? "font-medium text-ink" : "text-ink-3"}`}
              >
                {t.threshold}
              </span>
              <span className="h-2.5 overflow-hidden rounded-sm bg-line-2">
                <span
                  className={`block h-full ${top ? "bg-ink" : "bg-ink-3"}`}
                  style={{ width: `${Math.max(2, t.percentage * 100)}%` }}
                />
              </span>
              <span
                className={`text-right font-mono tabular-nums ${top ? "font-medium text-ink" : "text-ink-3"}`}
              >
                {Math.round(t.percentage * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line-2 px-3 py-2 text-[13px] text-ink sm:px-4">
        {caption}
        {primary && !hasConsensus(primary.thresholds)
          ? " That is what licenses moving the slider."
          : ""}
      </p>
    </div>
  );
}
