import { describe, expect, it } from "vitest";
import { claimsCohortEvaluation } from "./claims";
import { fact, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-26";

/** A claims-derived record: every fact carries provenance "claims". */
const beneficiary = (id: string, over: Partial<Parameters<typeof patient>[0]> = {}) =>
  patient({ id, age: 68, race: "White", ...over });

const claimsFact = (over: Partial<ReturnType<typeof fact>>) =>
  fact({ provenance: "claims", observedAt: "2026-09-01", ...over });

/** A trial that a claims feed CAN fully decide: coded events only. */
const codedOnly = trial({
  nctId: "NCT00000001",
  criteria: [
    leaf({ id: "INC-1", predicate: "age", operator: ">=", value: 18, tier: 0, sourceSpan: "Age >= 18" }),
    leaf({
      id: "INC-2",
      predicate: "diagnosis",
      operator: "==",
      value: "non-small cell lung cancer",
      tier: 0,
      sourceSpan: "NSCLC",
    }),
    leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      value: ["osimertinib"],
      tier: 0,
      sourceSpan: "Prior osimertinib",
    }),
  ],
});

/** A realistic trial: it also wants a lab and a biomarker, which claims lack. */
const realistic = trial({
  nctId: "NCT00000002",
  criteria: [
    ...codedOnly.criteria,
    leaf({
      id: "INC-3",
      predicate: "lab_value",
      analyte: "ANC",
      operator: ">=",
      value: 1500,
      unit: "/uL",
      tier: 1,
      sourceSpan: "ANC >= 1500/uL",
    }),
    leaf({
      id: "INC-4",
      predicate: "biomarker",
      analyte: "EGFR",
      operator: "==",
      value: "L858R",
      tier: 0,
      sourceSpan: "EGFR L858R",
    }),
  ],
});

const withNsclc = (id: string) =>
  beneficiary(id, {
    facts: [claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" })],
  });

describe("the cohort is checked, not assumed", () => {
  it("counts facts by provenance", () => {
    const r = claimsCohortEvaluation([withNsclc("B-1")], [codedOnly], ASOF);
    expect(r.cohort.byProvenance).toEqual({ chart: 0, claims: 1, patient_reported: 0 });
  });

  it("flags a cohort that is not claims-only, and says so in the headline", () => {
    // `fact()` defaults to chart, so this is a chart record wearing a claims label.
    const mixed = beneficiary("B-1", {
      facts: [fact({ predicate: "diagnosis", value: "non-small cell lung cancer" })],
    });
    const r = claimsCohortEvaluation([mixed], [codedOnly], ASOF);
    expect(r.cohort.claimsOnly).toBe(false);
    expect(r.headline).toMatch(/WARNING: this cohort is not claims-only/);
  });

  it("does not warn when every fact really is claims-derived", () => {
    const pure = beneficiary("B-1", {
      facts: [claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" })],
    });
    const r = claimsCohortEvaluation([pure], [codedOnly], ASOF);
    expect(r.cohort.claimsOnly).toBe(true);
    expect(r.headline).not.toMatch(/WARNING/);
  });
});

describe("what claims can settle", () => {
  const pure = (id: string, facts: ReturnType<typeof claimsFact>[]) =>
    beneficiary(id, { facts });

  it("confirms eligibility when every criterion is a coded event", () => {
    const b = pure("B-1", [
      claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
      claimsFact({ predicate: "prior_therapy", value: "carboplatin" }),
    ]);
    const r = claimsCohortEvaluation([b], [codedOnly], ASOF);
    expect(r.confirmedEligiblePairs).toBe(1);
    expect(r.meanUnknownsPerPair).toBe(0);
  });

  it("definitively excludes on a dispense the chart never saw", () => {
    const b = pure("B-1", [
      claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
      claimsFact({ predicate: "prior_therapy", value: "osimertinib" }),
    ]);
    const r = claimsCohortEvaluation([b], [codedOnly], ASOF);
    expect(r.definitivelyExcludedPairs).toBe(1);
    expect(r.confirmedEligiblePairs).toBe(0);
  });

  it("confirms almost nobody once a trial wants a lab and a biomarker", () => {
    // The headline finding. Identical beneficiary, realistic trial, and claims
    // can no longer rule anyone in — two criteria it structurally cannot answer.
    const b = pure("B-1", [
      claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
      claimsFact({ predicate: "prior_therapy", value: "carboplatin" }),
    ]);
    const r = claimsCohortEvaluation([b], [realistic], ASOF);
    expect(r.confirmedEligiblePairs).toBe(0);
    expect(r.undeterminedPairs).toBe(1);
    expect(r.meanUnknownsPerPair).toBe(2);
  });

  it("still excludes on the realistic trial, because ruling out is cheap", () => {
    const b = pure("B-1", [
      claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
      claimsFact({ predicate: "prior_therapy", value: "osimertinib" }),
    ]);
    const r = claimsCohortEvaluation([b], [realistic], ASOF);
    expect(r.definitivelyExcludedPairs).toBe(1);
  });

  it("never lets a claims lab value confirm a criterion", () => {
    // A claims feed carrying an ANC is still a bill. It must not rule anyone in.
    const b = pure("B-1", [
      claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
      claimsFact({ predicate: "prior_therapy", value: "carboplatin" }),
      claimsFact({ predicate: "lab_value", analyte: "ANC", value: 4000, unit: "/uL" }),
      claimsFact({ predicate: "biomarker", analyte: "EGFR", value: "L858R" }),
    ]);
    const r = claimsCohortEvaluation([b], [realistic], ASOF);
    expect(r.confirmedEligiblePairs).toBe(0);
    expect(r.cellsByReason.unsupported).toBe(2);
  });
});

describe("the counts add up", () => {
  const cohort = [
    beneficiary("B-1", {
      facts: [
        claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" }),
        claimsFact({ predicate: "prior_therapy", value: "osimertinib" }),
      ],
    }),
    beneficiary("B-2", {
      facts: [claimsFact({ predicate: "diagnosis", value: "non-small cell lung cancer" })],
    }),
    beneficiary("B-3", { facts: [] }),
  ];
  const trials = [codedOnly, realistic];
  const r = claimsCohortEvaluation(cohort, trials, ASOF);

  it("partitions every pair exactly once", () => {
    expect(r.definitivelyExcludedPairs + r.confirmedEligiblePairs + r.undeterminedPairs).toBe(
      r.pairs,
    );
    expect(r.pairs).toBe(cohort.length * trials.length);
  });

  it("assigns every cell a reason", () => {
    const summed = Object.values(r.cellsByReason).reduce((a, b) => a + b, 0);
    expect(summed).toBe(r.totalCells);
    expect(r.totalCells).toBeGreaterThan(0);
  });

  it("keeps every share a proportion", () => {
    for (const s of [r.shareDefinitivelyExcluded, r.shareConfirmedEligible]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("counts a beneficiary excluded from the whole pool", () => {
    expect(r.patientsExcludedFromAllTrials).toBe(1); // B-1, on prior osimertinib
  });

  it("reports mean and median unknowns per pair", () => {
    expect(r.meanUnknownsPerPair).toBeGreaterThan(0);
    expect(r.medianUnknownsPerPair).toBeGreaterThanOrEqual(0);
  });

  it("generates the headline from the counts", () => {
    expect(r.headline).toMatch(/definitively exclude \d+\.\d%/);
    expect(r.headline).toMatch(/confirm eligibility for \d+\.\d%/);
    expect(r.headline).toMatch(/need a chart/);
  });
});

describe("edges", () => {
  it("is empty-cohort safe and does not divide by zero", () => {
    const r = claimsCohortEvaluation([], [codedOnly], ASOF);
    expect(r).toMatchObject({ pairs: 0, shareConfirmedEligible: 0, meanUnknownsPerPair: 0 });
    expect(Number.isFinite(r.shareDefinitivelyExcluded)).toBe(true);
  });

  it("is empty-pool safe, and claims nobody is excluded from everything", () => {
    const r = claimsCohortEvaluation([withNsclc("B-1")], [], ASOF);
    expect(r.pairs).toBe(0);
    // Vacuously excluded from all zero trials is not a finding; it must not count.
    expect(r.patientsExcludedFromAllTrials).toBe(0);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const cohort = [withNsclc("B-1")];
    const before = JSON.stringify(cohort);
    expect(claimsCohortEvaluation(cohort, [realistic], ASOF)).toEqual(
      claimsCohortEvaluation(cohort, [realistic], ASOF),
    );
    expect(JSON.stringify(cohort)).toBe(before);
  });

  it("takes a median across an even number of pairs", () => {
    const cohort = [withNsclc("B-1"), withNsclc("B-2")];
    const r = claimsCohortEvaluation(cohort, [realistic], ASOF);
    expect(r.medianUnknownsPerPair).toBeGreaterThan(0);
  });
});
