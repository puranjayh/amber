import { describe, expect, test } from "vitest";
import type { ElasticityPoint } from "../../src/contracts";
import sample from "../../app/_data/elasticity.sample.json";
import { buildSweep } from "./sweep";

const pts = (...rows: [number, number, Record<string, number>?][]): ElasticityPoint[] =>
  rows.map(([threshold, eligibleCount, bySubgroup]) => ({
    threshold,
    eligibleCount,
    excludedByThisAlone: 0,
    bySubgroup,
  }));

describe("buildSweep", () => {
  test("deltas are relative to the protocol threshold", () => {
    const sweep = buildSweep(pts([30, 200], [50, 160], [60, 120]), 50, ">=");
    expect(sweep.protocolIndex).toBe(1);
    expect(sweep.rows.map((r) => r.deltaVsProtocol)).toEqual([40, 0, -40]);
  });

  test("subgroup deltas and ordering follow the protocol row", () => {
    const sweep = buildSweep(
      pts([40, 10, { A: 4, B: 6 }], [50, 8, { A: 3, B: 5 }]),
      50,
      ">=",
    );
    expect(sweep.subgroups).toEqual(["B", "A"]);
    expect(sweep.rows[0].subgroupDelta).toEqual({ A: 1, B: 1 });
    expect(sweep.maxSubgroupCount).toBe(6);
  });

  test("loosening direction comes from the operator", () => {
    expect(buildSweep(pts([1, 2], [2, 1]), 1, ">=").loosenTowards).toBe("lower");
    expect(buildSweep(pts([1, 1], [2, 2]), 1, "<=").loosenTowards).toBe("higher");
  });

  test("chart geometry spans the viewBox and peaks at the max count", () => {
    const sweep = buildSweep(pts([0, 10], [5, 5], [10, 0]), 5, ">=");
    const [first, , last] = sweep.rows;
    expect(first.x).toBeLessThan(last.x);
    expect(first.y).toBeLessThan(last.y);
    expect(sweep.chart.line.startsWith("M")).toBe(true);
    expect(sweep.chart.area.endsWith("Z")).toBe(true);
  });

  test("rejects unsorted thresholds and an off-grid protocol value", () => {
    expect(() => buildSweep(pts([2, 1], [1, 2]), 2, ">=")).toThrow(/ascending/);
    expect(() => buildSweep(pts([1, 2], [2, 1]), 1.5, ">=")).toThrow(/not a precomputed/);
  });

  test("the hand-written sample is internally consistent", () => {
    const rows = sample as ElasticityPoint[];
    const pool = rows[0].eligibleCount + rows[0].excludedByThisAlone;
    for (const r of rows) {
      expect(r.eligibleCount + r.excludedByThisAlone).toBe(pool);
      const subgroupTotal = Object.values(r.bySubgroup ?? {}).reduce((a, b) => a + b, 0);
      expect(subgroupTotal).toBe(r.eligibleCount);
    }
    expect(() => buildSweep(rows, 50, ">=")).not.toThrow();
  });
});
