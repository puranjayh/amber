import { describe, expect, it } from "vitest";
import { ElasticityPoint as ElasticityPointSchema } from "@/src/contracts";
import { MAX_SWEEP_POINTS, sweep, sweepThresholds, sweepableLeaves, withLeafValue } from "./elasticity";
import { fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

const ancFloor = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  maxAgeDays: 28,
  tier: 1,
  sweepable: true,
  sweepRange: [1000, 2000],
  sweepStep: 250,
  sourceSpan: "ANC >= 1500/uL",
});

/** One patient per ANC value, so the curve is exactly predictable. */
const withAnc = (id: string, value: number, race = "White") =>
  patient({
    id,
    age: 60,
    race,
    facts: [
      fact({
        predicate: "lab_value",
        analyte: "ANC",
        value,
        unit: "/uL",
        observedAt: "2026-09-20",
        sourceQuote: `ANC ${value}/uL`,
      }),
    ],
  });

describe("sweepThresholds", () => {
  it("walks the range inclusively at the declared step", () => {
    expect(sweepThresholds(ancFloor)).toEqual([1000, 1250, 1500, 1750, 2000]);
  });

  it("defaults to ten intervals when the compiler gave no step", () => {
    const l = leaf({ id: "A", sweepable: true, sweepRange: [0, 10] });
    expect(sweepThresholds(l)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps fractional steps clean instead of leaking float noise", () => {
    const l = leaf({ id: "A", sweepable: true, sweepRange: [0.1, 0.5], sweepStep: 0.1 });
    expect(sweepThresholds(l)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("still tests the far end when the step does not divide the range", () => {
    const l = leaf({ id: "A", sweepable: true, sweepRange: [0, 10], sweepStep: 3 });
    expect(sweepThresholds(l)).toEqual([0, 3, 6, 9, 10]);
  });

  it("handles a degenerate single-value range", () => {
    const l = leaf({ id: "A", sweepable: true, sweepRange: [5, 5] });
    expect(sweepThresholds(l)).toEqual([5]);
  });

  it("refuses a leaf with no range instead of guessing one", () => {
    expect(() => sweepThresholds(leaf({ id: "A" }))).toThrow(/sweepRange/);
  });

  it("refuses an inverted range and a non-positive step", () => {
    expect(() => sweepThresholds(leaf({ id: "A", sweepRange: [10, 1] }))).toThrow(/inverted/);
    expect(() => sweepThresholds(leaf({ id: "A", sweepRange: [1, 10], sweepStep: -1 }))).toThrow(
      /sweepStep/,
    );
  });

  it("refuses a sweep too large to precompute, naming the numbers", () => {
    const l = leaf({ id: "A", sweepable: true, sweepRange: [0, 10_000], sweepStep: 1 });
    expect(() => sweepThresholds(l)).toThrow(new RegExp(String(MAX_SWEEP_POINTS)));
    expect(() => sweepThresholds(l)).toThrow(/10001 points/);
  });
});

describe("withLeafValue", () => {
  const t = trial({ criteria: [group("AND", [ancFloor, leaf({ id: "INC-other", value: 1 })])] });

  it("replaces a nested leaf's threshold", () => {
    const out = withLeafValue(t, "INC-anc", 1000);
    const g = out.criteria[0];
    if (g.kind !== "group") throw new Error("expected a group");
    expect(g.children[0]).toMatchObject({ id: "INC-anc", value: 1000 });
  });

  it("leaves the original trial untouched", () => {
    const before = JSON.stringify(t);
    withLeafValue(t, "INC-anc", 1000);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("keeps every other leaf identical", () => {
    const out = withLeafValue(t, "INC-anc", 1000);
    const g = out.criteria[0];
    if (g.kind !== "group") throw new Error("expected a group");
    expect(g.children[1]).toMatchObject({ id: "INC-other", value: 1 });
  });

  it("refuses an unknown criterion id rather than silently changing nothing", () => {
    expect(() => withLeafValue(t, "INC-nope", 1)).toThrow(/no criterion INC-nope/);
  });
});

describe("sweepableLeaves", () => {
  it("offers only leaves the compiler marked sweepable with a range", () => {
    const t = trial({
      criteria: [
        ancFloor,
        leaf({ id: "INC-flagged-no-range", sweepable: true }),
        leaf({ id: "INC-not-flagged", sweepRange: [0, 1] }),
      ],
    });
    expect(sweepableLeaves(t).map((l) => l.id)).toEqual(["INC-anc"]);
  });
});

describe("sweep", () => {
  const t = trial({ nctId: "NCT00000001", criteria: [ancFloor] });
  const cohort = [
    withAnc("PT-1100", 1100),
    withAnc("PT-1400", 1400),
    withAnc("PT-1600", 1600),
    withAnc("PT-1900", 1900),
  ];

  it("produces one point per threshold, in ascending order", () => {
    expect(sweep(t, "INC-anc", cohort, ASOF).map((p) => p.threshold)).toEqual([
      1000, 1250, 1500, 1750, 2000,
    ]);
  });

  it("counts eligible patients at each threshold", () => {
    // floors 1000/1250/1500/1750/2000 against ANC 1100/1400/1600/1900
    expect(sweep(t, "INC-anc", cohort, ASOF).map((p) => p.eligibleCount)).toEqual([4, 3, 2, 1, 0]);
  });

  it("is monotonically non-increasing as a >= floor rises", () => {
    const counts = sweep(t, "INC-anc", cohort, ASOF).map((p) => p.eligibleCount);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
  });

  it("attributes exclusions to this criterion when it is the only thing in the way", () => {
    // Nothing else stands in anyone's way here, so this is the mirror of the
    // eligible count.
    expect(sweep(t, "INC-anc", cohort, ASOF).map((p) => p.excludedByThisAlone)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("does not claim a patient who is also excluded on something else", () => {
    // PT-1100 is under the ANC floor AND the wrong stage. Loosening ANC alone
    // would not enrol them, so the slider must not take credit for them.
    const stage = leaf({
      id: "INC-stage",
      predicate: "staging",
      operator: "in",
      value: ["IIIA", "IIIB"],
      tier: 2,
      sourceSpan: "Stage IIIA or IIIB",
    });
    const twoHurdles = trial({ nctId: "NCT00000002", criteria: [ancFloor, stage] });
    const alsoWrongStage = {
      ...withAnc("PT-1100", 1100),
      facts: [
        ...withAnc("PT-1100", 1100).facts,
        fact({ predicate: "staging", value: "IVB", sourceQuote: "Stage IVB" }),
      ],
    };
    const rightStage = (p: ReturnType<typeof withAnc>) => ({
      ...p,
      facts: [...p.facts, fact({ predicate: "staging", value: "IIIA", sourceQuote: "Stage IIIA" })],
    });

    const points = sweep(twoHurdles, "INC-anc", [alsoWrongStage, rightStage(withAnc("PT-1400", 1400))], ASOF);
    const at1500 = points.find((p) => p.threshold === 1500)!;
    expect(at1500.eligibleCount).toBe(0);
    expect(at1500.excludedByThisAlone).toBe(1); // PT-1400 only, not PT-1100
  });

  it("counts a patient with open unknowns as not-yet-excluded, not as excluded", () => {
    // Rule 4 in curve form: silence must not read as a threshold failure.
    const silent = patient({ id: "PT-SILENT", age: 60, race: "White" });
    const points = sweep(t, "INC-anc", [silent], ASOF);
    expect(points.every((p) => p.eligibleCount === 1)).toBe(true);
    expect(points.every((p) => p.excludedByThisAlone === 0)).toBe(true);
  });

  it("does not move a stale patient's curve at all — they are UNKNOWN throughout", () => {
    const stale = patient({
      id: "PT-STALE",
      age: 60,
      race: "White",
      facts: [fact({ predicate: "lab_value", analyte: "ANC", value: 200, unit: "/uL", observedAt: "2024-01-01" })],
    });
    const counts = sweep(t, "INC-anc", [stale], ASOF).map((p) => p.eligibleCount);
    expect(counts).toEqual([1, 1, 1, 1, 1]);
  });

  it("breaks the eligible count down by race", () => {
    const mixed = [
      withAnc("PT-A", 1900, "Black or African American"),
      withAnc("PT-B", 1100, "Black or African American"),
      withAnc("PT-C", 1900, "White"),
    ];
    const at1500 = sweep(t, "INC-anc", mixed, ASOF).find((p) => p.threshold === 1500)!;
    expect(at1500.bySubgroup).toEqual({ "Black or African American": 1, White: 1 });
  });

  it("keeps a subgroup's key once it drops to zero, so the drop is visible", () => {
    const mixed = [
      withAnc("PT-A", 1100, "Black or African American"),
      withAnc("PT-C", 1900, "White"),
    ];
    const points = sweep(t, "INC-anc", mixed, ASOF);
    expect(points.find((p) => p.threshold === 1000)!.bySubgroup).toEqual({
      "Black or African American": 1,
      White: 1,
    });
    expect(points.find((p) => p.threshold === 1500)!.bySubgroup).toEqual({
      "Black or African American": 0,
      White: 1,
    });
  });

  it("sweeps a leaf nested inside a group", () => {
    const nested = trial({ nctId: "NCT00000003", criteria: [group("AND", [group("OR", [ancFloor])])] });
    expect(sweep(nested, "INC-anc", cohort, ASOF).map((p) => p.eligibleCount)).toEqual([
      4, 3, 2, 1, 0,
    ]);
  });

  it("sweeps an exclusion ceiling in the opposite direction", () => {
    const bili = leaf({
      id: "EXC-bili",
      type: "exclusion",
      predicate: "lab_value",
      analyte: "bilirubin",
      operator: ">",
      value: 1.5,
      unit: "mg/dL",
      tier: 1,
      sweepable: true,
      sweepRange: [1, 3],
      sweepStep: 1,
      sourceSpan: "Bilirubin greater than 1.5 mg/dL",
    });
    const cohort2 = [1.2, 2.4, 3.5].map((v, i) =>
      patient({
        id: `PT-B${i}`,
        age: 60,
        facts: [fact({ predicate: "lab_value", analyte: "bilirubin", value: v, unit: "mg/dL" })],
      }),
    );
    const counts = sweep(trial({ nctId: "NCT00000004", criteria: [bili] }), "EXC-bili", cohort2, ASOF)
      .map((p) => p.eligibleCount);
    // A rising ceiling excludes fewer people, so eligibility goes up:
    // at 1 mg/dL all three are over it, at 2 only the 1.2 clears, at 3 both
    // 1.2 and 2.4 clear.
    expect(counts).toEqual([0, 1, 2]);
  });

  it("returns points the frozen ElasticityPoint schema accepts", () => {
    for (const p of sweep(t, "INC-anc", cohort, ASOF)) {
      expect(() => ElasticityPointSchema.parse(p)).not.toThrow();
    }
  });

  it("is empty-cohort safe", () => {
    const points = sweep(t, "INC-anc", [], ASOF);
    expect(points).toHaveLength(5);
    expect(points.every((p) => p.eligibleCount === 0 && p.excludedByThisAlone === 0)).toBe(true);
    expect(points[0].bySubgroup).toEqual({});
  });

  it("refuses an unknown criterion id", () => {
    expect(() => sweep(t, "INC-nope", cohort, ASOF)).toThrow(/no criterion INC-nope/);
  });

  it("does not mutate the trial or the cohort", () => {
    const tBefore = JSON.stringify(t);
    const cohortBefore = JSON.stringify(cohort);
    sweep(t, "INC-anc", cohort, ASOF);
    expect(JSON.stringify(t)).toBe(tBefore);
    expect(JSON.stringify(cohort)).toBe(cohortBefore);
  });

  it("is deterministic", () => {
    expect(sweep(t, "INC-anc", cohort, ASOF)).toEqual(sweep(t, "INC-anc", cohort, ASOF));
  });
});
