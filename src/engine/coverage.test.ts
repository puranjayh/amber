import { describe, expect, it } from "vitest";
import type { Predicate, Provenance } from "@/src/contracts";
import { claimsCoverage } from "./coverage";
import { answerableBy, ceilingFor, explainAnswerability } from "./provenance";
import { group, leaf, trial } from "./testing";

const ALL_PREDICATES: Predicate[] = [
  "age",
  "lab_value",
  "biomarker",
  "prior_therapy",
  "performance_status",
  "diagnosis",
  "staging",
  "washout",
  "comorbidity",
  "contraindication",
];

const NEVER: Predicate[] = ["lab_value", "biomarker", "performance_status", "staging"];
const SOMETIMES: Predicate[] = ["washout", "contraindication"];
const YES: Predicate[] = ["age", "prior_therapy", "diagnosis", "comorbidity"];

const l = (predicate: Predicate, over = {}) =>
  leaf({ id: `L-${predicate}`, predicate, tier: 0, ...over });

describe("answerableBy", () => {
  it("answers yes for the chart, always — the chart is the record", () => {
    for (const p of ALL_PREDICATES) expect(answerableBy(l(p), "chart"), p).toBe("yes");
  });

  it("answers never for patient report, always", () => {
    for (const p of ALL_PREDICATES) expect(answerableBy(l(p), "patient_reported"), p).toBe("never");
  });

  it("never answers a result a claim does not contain", () => {
    for (const p of NEVER) expect(answerableBy(l(p), "claims"), p).toBe("never");
  });

  it("answers yes for the coded events a claim is made of", () => {
    for (const p of YES) expect(answerableBy(l(p), "claims"), p).toBe("yes");
  });

  it("answers sometimes where it genuinely depends on the criterion", () => {
    for (const p of SOMETIMES) expect(answerableBy(l(p), "claims"), p).toBe("sometimes");
  });

  it("classifies every predicate in the contract exactly once", () => {
    expect([...NEVER, ...SOMETIMES, ...YES].sort()).toEqual([...ALL_PREDICATES].sort());
  });

  it("uses all three values, so `sometimes` is not vestigial", () => {
    const seen = new Set(ALL_PREDICATES.map((p) => answerableBy(l(p), "claims")));
    expect([...seen].sort()).toEqual(["never", "sometimes", "yes"]);
  });

  it("catches a measurement filed under a coded predicate", () => {
    // A QTc threshold is a contraindication in the tree and a measurement in
    // reality. A claim shows the ECG was billed, not the interval.
    const qtc = l("contraindication", { analyte: "QTc", unit: "ms", operator: ">", value: 470 });
    expect(answerableBy(qtc, "claims")).toBe("never");
    expect(explainAnswerability(qtc, "claims").because).toMatch(/QTc is a measurement/);
  });

  it("catches an ejection fraction filed as a comorbidity", () => {
    const lvef = l("comorbidity", { analyte: "LVEF", unit: "%", operator: "<", value: 50 });
    expect(answerableBy(lvef, "claims")).toBe("never");
  });

  it("does not mistake a plain age threshold for a measurement", () => {
    // Numeric with a unit, but no analyte — demographics, not a test result.
    expect(answerableBy(l("age", { operator: ">=", value: 18, unit: "years" }), "claims")).toBe("yes");
  });

  it("does not mistake a coded comorbidity for a measurement", () => {
    expect(
      answerableBy(l("comorbidity", { operator: "==", value: "COPD" }), "claims"),
    ).toBe("yes");
  });

  it("gives a reason for every verdict", () => {
    for (const provenance of ["chart", "claims", "patient_reported"] as Provenance[]) {
      for (const p of ALL_PREDICATES) {
        const e = explainAnswerability(l(p), provenance);
        expect(e.because.length, `${p}/${provenance}`).toBeGreaterThan(10);
        expect(e.answerable).toBe(answerableBy(l(p), provenance));
      }
    }
  });
});

describe("answerableBy agrees with the evaluation-time ceiling", () => {
  // The invariant tying the coverage statistic to what the engine actually does.
  // If these two ever disagree, one of the numbers on stage is a lie.
  it("never here means a ceiling there", () => {
    for (const provenance of ["chart", "claims", "patient_reported"] as Provenance[]) {
      for (const p of ALL_PREDICATES) {
        const answerable = answerableBy(l(p), provenance);
        const ceiling = ceilingFor(provenance, p);
        if (answerable === "never") {
          expect(ceiling, `${p}/${provenance}`).not.toBe("none");
        } else {
          expect(ceiling, `${p}/${provenance}`).toBe("none");
        }
      }
    }
  });
});

/* --------------------------------------------------------------- the report */

const t = (nctId: string, predicates: Predicate[], over = {}) =>
  trial({
    nctId,
    criteria: predicates.map((p, i) => leaf({ id: `L${i}`, predicate: p, tier: 0 })),
    ...over,
  });

describe("claimsCoverage", () => {
  it("counts every leaf into exactly one bucket", () => {
    const report = claimsCoverage([t("NCT00000001", ALL_PREDICATES)]);
    const { yes, sometimes, never, criteria } = report.overall;
    expect(criteria).toBe(ALL_PREDICATES.length);
    expect(yes + sometimes + never).toBe(criteria);
    expect([yes, sometimes, never]).toEqual([4, 2, 4]);
  });

  it("counts only `yes` in the headline share, so the claim is a lower bound", () => {
    const report = claimsCoverage([t("NCT00000001", ALL_PREDICATES)]);
    expect(report.overall.shareAnswerable).toBeCloseTo(0.4, 6);
    expect(report.overall.shareAnswerableOptimistic).toBeCloseTo(0.6, 6);
    expect(report.overall.shareRequiringChart).toBeCloseTo(0.6, 6);
  });

  it("makes answerable and requires-a-chart sum to one", () => {
    const report = claimsCoverage([t("NCT00000001", ALL_PREDICATES)]);
    expect(report.overall.shareAnswerable + report.overall.shareRequiringChart).toBeCloseTo(1, 6);
  });

  it("generates the headline from the data, so it cannot drift", () => {
    const report = claimsCoverage([t("NCT00000001", ["diagnosis", "lab_value"])], {
      condition: "lung cancer",
    });
    expect(report.headline).toBe(
      "Across 1 lung cancer trials, claims can answer 50.0% of eligibility criteria; the rest requires a chart.",
    );
  });

  it("states in the basis that `sometimes` is counted as requiring a chart", () => {
    const report = claimsCoverage([t("NCT00000001", ["washout", "diagnosis"])]);
    expect(report.headlineBasis).toMatch(/counted as requiring a chart/);
    expect(report.headlineBasis).toMatch(/lower bound/);
    expect(report.headlineBasis).toMatch(/upper bound is 100.0%/);
  });

  it("breaks down by predicate", () => {
    const report = claimsCoverage([t("NCT00000001", ["lab_value", "lab_value", "diagnosis"])]);
    const lab = report.byPredicate.find((r) => r.predicate === "lab_value")!;
    expect(lab.tally).toMatchObject({ criteria: 2, never: 2, yes: 0, shareAnswerable: 0 });
    const dx = report.byPredicate.find((r) => r.predicate === "diagnosis")!;
    expect(dx.tally).toMatchObject({ criteria: 1, yes: 1, shareAnswerable: 1 });
  });

  it("omits a predicate the pool never uses, rather than reporting a zero row", () => {
    const report = claimsCoverage([t("NCT00000001", ["diagnosis"])]);
    expect(report.byPredicate.map((r) => r.predicate)).toEqual(["diagnosis"]);
  });

  it("breaks down by inclusion versus exclusion", () => {
    const mixed = trial({
      nctId: "NCT00000001",
      criteria: [
        leaf({ id: "INC-1", type: "inclusion", predicate: "lab_value", tier: 1 }),
        leaf({ id: "EXC-1", type: "exclusion", predicate: "comorbidity", tier: 0 }),
        leaf({ id: "EXC-2", type: "exclusion", predicate: "diagnosis", tier: 0 }),
      ],
    });
    const report = claimsCoverage([mixed]);
    const inc = report.byType.find((r) => r.type === "inclusion")!;
    const exc = report.byType.find((r) => r.type === "exclusion")!;
    expect(inc.tally).toMatchObject({ criteria: 1, yes: 0 });
    expect(exc.tally).toMatchObject({ criteria: 2, yes: 2 });
  });

  it("always reports both types, even when the pool has only one", () => {
    const report = claimsCoverage([t("NCT00000001", ["diagnosis"])]);
    expect(report.byType.map((r) => r.type)).toEqual(["inclusion", "exclusion"]);
    expect(report.byType.find((r) => r.type === "exclusion")!.tally.criteria).toBe(0);
  });

  it("reports per trial, worst-covered first", () => {
    const report = claimsCoverage([
      t("NCT00000001", ["diagnosis", "comorbidity"]), // 100%
      t("NCT00000002", ["lab_value", "biomarker"]), // 0%
      t("NCT00000003", ["diagnosis", "lab_value"]), // 50%
    ]);
    expect(report.perTrial.map((x) => x.nctId)).toEqual([
      "NCT00000002",
      "NCT00000003",
      "NCT00000001",
    ]);
  });

  it("walks nested groups, counting each branch as its own criterion", () => {
    // Three OR branches are three separate things somebody has to find out.
    const nested = trial({
      nctId: "NCT00000001",
      criteria: [
        group("OR", [
          leaf({ id: "A", predicate: "biomarker", tier: 0 }),
          leaf({ id: "B", predicate: "biomarker", tier: 0 }),
          group("AND", [leaf({ id: "C", predicate: "diagnosis", tier: 0 })]),
        ]),
      ],
    });
    const report = claimsCoverage([nested]);
    expect(report.overall.criteria).toBe(3);
    expect(report.overall.never).toBe(2);
  });

  it("buckets the per-trial spread into fixed ten-point bands", () => {
    const report = claimsCoverage([
      t("NCT00000001", ["diagnosis", "comorbidity"]), // 100%
      t("NCT00000002", ["lab_value", "biomarker"]), // 0%
      t("NCT00000003", ["diagnosis", "lab_value"]), // 50%
    ]);
    expect(report.distribution).toHaveLength(10);
    expect(report.distribution.find((d) => d.band === "0-10%")!.trials).toBe(1);
    expect(report.distribution.find((d) => d.band === "50-60%")!.trials).toBe(1);
    // 100% belongs in the top band, not an eleventh one.
    expect(report.distribution.find((d) => d.band === "90-100%")!.trials).toBe(1);
  });

  it("keeps empty bands, because a gap in the histogram is information", () => {
    const report = claimsCoverage([t("NCT00000001", ["diagnosis"])]);
    expect(report.distribution.filter((d) => d.trials === 0)).toHaveLength(9);
  });

  it("sets a trial with no compiled criteria aside instead of scoring it zero", () => {
    // 67 of the 300 compiled records are like this. Counting them as 0% would
    // drag the headline down with trials that have no criteria at all.
    const report = claimsCoverage([
      t("NCT00000001", ["diagnosis"]),
      trial({ nctId: "NCT00000002", criteria: [] }),
    ]);
    expect(report.trials).toBe(1);
    expect(report.trialsWithoutCriteria).toEqual(["NCT00000002"]);
    expect(report.overall.shareAnswerable).toBe(1);
  });

  it("restricts to the demo pool on request, and does not by default", () => {
    const pool = [
      t("NCT00000001", ["diagnosis"]),
      t("NCT00000002", ["lab_value"], { needsHumanReview: true }),
    ];
    expect(claimsCoverage(pool).trials).toBe(2);
    expect(claimsCoverage(pool, { demoPoolOnly: true }).trials).toBe(1);
    expect(claimsCoverage(pool, { demoPoolOnly: true }).overall.shareAnswerable).toBe(1);
  });

  it("can size a source other than claims", () => {
    const report = claimsCoverage([t("NCT00000001", ALL_PREDICATES)], { provenance: "chart" });
    expect(report.overall.shareAnswerable).toBe(1);
    expect(report.provenance).toBe("chart");
  });

  it("is empty-input safe and does not divide by zero", () => {
    const report = claimsCoverage([]);
    expect(report.overall).toMatchObject({ criteria: 0, shareAnswerable: 0 });
    expect(report.headline).toMatch(/Across 0 /);
    expect(Number.isFinite(report.overall.shareAnswerable)).toBe(true);
  });

  it("is deterministic and does not mutate the pool", () => {
    const pool = [t("NCT00000002", ["lab_value"]), t("NCT00000001", ["diagnosis"])];
    const before = JSON.stringify(pool);
    expect(claimsCoverage(pool)).toEqual(claimsCoverage(pool));
    expect(JSON.stringify(pool)).toBe(before);
  });

  it("keeps every share a proportion", () => {
    const report = claimsCoverage([t("NCT00000001", ALL_PREDICATES)]);
    for (const tally of [report.overall, ...report.byPredicate.map((r) => r.tally)]) {
      for (const share of [
        tally.shareAnswerable,
        tally.shareAnswerableOptimistic,
        tally.shareRequiringChart,
      ]) {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
    }
  });
});
