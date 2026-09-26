import type { ElasticityPoint, Operator } from "@/src/contracts";

export type SweepRow = ElasticityPoint & {
  deltaVsProtocol: number;
  /** Subgroup counts minus the same subgroup at the protocol threshold. */
  subgroupDelta: Record<string, number>;
  /** Chart x/y for this row, in viewBox units. */
  x: number;
  y: number;
};

export type Sweep = {
  rows: SweepRow[];
  protocolIndex: number;
  subgroups: string[];
  maxSubgroupCount: number;
  /** Direction that admits more patients, derived from the operator. */
  loosenTowards: "lower" | "higher";
  chart: { width: number; height: number; line: string; area: string; yMax: number };
};

export const CHART = { width: 320, height: 120, padX: 6, padY: 8 } as const;

/**
 * Build the complete lookup table once, off the interaction path. The slider indexes
 * into `rows` and never computes anything on drag.
 */
export function buildSweep(
  points: ElasticityPoint[],
  protocolThreshold: number,
  operator: Operator,
): Sweep {
  if (points.length < 2) throw new Error("elasticity sweep needs at least two points");
  for (let i = 1; i < points.length; i++) {
    if (!(points[i].threshold > points[i - 1].threshold)) {
      throw new Error(`elasticity thresholds must be strictly ascending at index ${i}`);
    }
  }
  const protocolIndex = points.findIndex((p) => p.threshold === protocolThreshold);
  if (protocolIndex === -1) {
    throw new Error(`protocol threshold ${protocolThreshold} is not a precomputed sweep point`);
  }

  const protocol = points[protocolIndex];
  const subgroups = [
    ...new Set(points.flatMap((p) => Object.keys(p.bySubgroup ?? {}))),
  ].sort((a, b) => (protocol.bySubgroup?.[b] ?? 0) - (protocol.bySubgroup?.[a] ?? 0));

  const yMax = Math.max(...points.map((p) => p.eligibleCount));
  const lo = points[0].threshold;
  const span = points[points.length - 1].threshold - lo;
  const innerW = CHART.width - CHART.padX * 2;
  const innerH = CHART.height - CHART.padY * 2;

  const rows: SweepRow[] = points.map((p) => {
    const subgroupDelta: Record<string, number> = {};
    for (const g of subgroups) {
      subgroupDelta[g] = (p.bySubgroup?.[g] ?? 0) - (protocol.bySubgroup?.[g] ?? 0);
    }
    return {
      ...p,
      deltaVsProtocol: p.eligibleCount - protocol.eligibleCount,
      subgroupDelta,
      x: CHART.padX + ((p.threshold - lo) / span) * innerW,
      y: CHART.padY + (1 - p.eligibleCount / yMax) * innerH,
    };
  });

  const line = rows.map((r, i) => `${i === 0 ? "M" : "L"}${r.x.toFixed(1)},${r.y.toFixed(1)}`).join(" ");
  const baseY = (CHART.height - CHART.padY).toFixed(1);
  const area = `${line} L${rows[rows.length - 1].x.toFixed(1)},${baseY} L${rows[0].x.toFixed(1)},${baseY} Z`;

  return {
    rows,
    protocolIndex,
    subgroups,
    maxSubgroupCount: Math.max(0, ...points.flatMap((p) => Object.values(p.bySubgroup ?? {}))),
    loosenTowards: operator === ">=" || operator === ">" ? "lower" : "higher",
    chart: { width: CHART.width, height: CHART.height, line, area, yMax },
  };
}

/** Pages must not 500 when a published sweep and a leaf disagree. */
export function tryBuildSweep(
  points: ElasticityPoint[],
  protocolThreshold: number,
  operator: Operator,
): Sweep | null {
  try {
    return buildSweep(points, protocolThreshold, operator);
  } catch {
    return null;
  }
}
