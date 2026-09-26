import type { EquityRow } from "@/src/contracts";

export type EquityView = {
  rows: (EquityRow & { worst: string; best: string })[];
  subgroups: string[];
  maxRate: number;
};

/** Sort by gap (the audit's headline), keep subgroup order stable across rows. */
export function buildEquityView(rows: EquityRow[]): EquityView {
  const subgroups = [
    ...new Set(rows.flatMap((r) => Object.keys(r.exclusionRateBySubgroup))),
  ].sort();

  const annotated = rows.map((r) => {
    const entries = Object.entries(r.exclusionRateBySubgroup).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    return { ...r, worst: entries[0]?.[0] ?? "", best: entries[entries.length - 1]?.[0] ?? "" };
  });

  annotated.sort((a, b) => b.maxGapPoints - a.maxGapPoints || a.criterionId.localeCompare(b.criterionId));

  return {
    rows: annotated,
    subgroups,
    maxRate: Math.max(0, ...rows.flatMap((r) => Object.values(r.exclusionRateBySubgroup))),
  };
}

export function gapPoints(rates: Record<string, number>): number {
  const values = Object.values(rates);
  if (values.length < 2) return 0;
  return Math.round((Math.max(...values) - Math.min(...values)) * 100);
}
