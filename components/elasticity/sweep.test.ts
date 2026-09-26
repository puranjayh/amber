import { describe, expect, test } from "vitest";
import { TrialsFixture, type CriterionLeaf, type ElasticityPoint } from "@/src/contracts";
import sweepsJson from "@/app/_data/elasticity.json";
import trialsJson from "@/app/_data/trials.json";
import { collectLeaves } from "../criteria/rows";
import { clampSweepIndex } from "./ElasticityView";
import { buildSweep, tryBuildSweep } from "./sweep";

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
    expect(tryBuildSweep(pts([1, 2], [2, 1]), 1.5, ">=")).toBeNull();
  });

  test("slider index clamps when the sweep shrinks", () => {
    const sweep = buildSweep(pts([1, 2], [2, 1]), 1, ">=");
    expect(clampSweepIndex(40, sweep)).toBe(0);
    expect(clampSweepIndex(1, sweep)).toBe(1);
  });

  test("every generated sweep builds against its protocol threshold", () => {
    const trials = TrialsFixture.parse(trialsJson);
    for (const s of sweepsJson as { nctId: string; criterionId: string; points: ElasticityPoint[] }[]) {
      const trial = trials.find((t) => t.nctId === s.nctId)!;
      const leaf = collectLeaves(trial.criteria).get(s.criterionId) as CriterionLeaf;
      expect(() => buildSweep(s.points, leaf.value as number, leaf.operator)).not.toThrow();
    }
  });
});
