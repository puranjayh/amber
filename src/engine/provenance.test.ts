/**
 * THE PROVENANCE SUITE.
 *
 * The architectural claim, asserted from every side: a source may only prove
 * what it is capable of proving. A claim is a bill — it can rule a lab out and
 * can never confirm one. A patient's account decides nothing at all.
 *
 * This is the payer story in code. If it can be broken, the story is marketing.
 */
import { describe, expect, it } from "vitest";
import type { Fact, Predicate, Verdict } from "@/src/contracts";
import {
  canConfirm,
  ceilingFor,
  claimsConfirmablePredicates,
  explainCeiling,
} from "./provenance";
import { evaluate, evaluateLeaf, evaluateWithNotes } from "./evaluate";
import { fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

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

/** Predicates where a claim is a proxy for a result it never contains. */
const NOT_CONFIRMABLE: Predicate[] = [
  "lab_value",
  "biomarker",
  "performance_status",
  "staging",
];

const CONFIRMABLE: Predicate[] = [
  "age",
  "prior_therapy",
  "diagnosis",
  "comorbidity",
  "contraindication",
  "washout",
];

describe("the ceiling table", () => {
  it("lets the chart prove anything", () => {
    for (const p of ALL_PREDICATES) expect(ceilingFor("chart", p)).toBe("none");
  });

  it("stops claims confirming a result they never contain", () => {
    for (const p of NOT_CONFIRMABLE) expect(ceilingFor("claims", p), p).toBe("no_confirm");
  });

  it("lets claims confirm the things a claim actually records", () => {
    for (const p of CONFIRMABLE) expect(ceilingFor("claims", p), p).toBe("none");
  });

  it("gives patient report no verdict on anything medical", () => {
    for (const p of ALL_PREDICATES) expect(ceilingFor("patient_reported", p), p).toBe("no_verdict");
  });

  it("classifies every predicate in the contract, one way or the other", () => {
    expect([...CONFIRMABLE, ...NOT_CONFIRMABLE].sort()).toEqual([...ALL_PREDICATES].sort());
    expect(claimsConfirmablePredicates().sort()).toEqual([...CONFIRMABLE].sort());
  });

  it("agrees with canConfirm", () => {
    for (const p of ALL_PREDICATES) {
      expect(canConfirm("claims", p)).toBe(CONFIRMABLE.includes(p));
      expect(canConfirm("chart", p)).toBe(true);
      expect(canConfirm("patient_reported", p)).toBe(false);
    }
  });
});

describe("the note a UI shows", () => {
  it("says claims can rule out but not confirm", () => {
    const note = explainCeiling("claims", "lab_value")!;
    expect(note.note).toBe("Claims can rule this out but not confirm it — needs the chart.");
    expect(note.because).toMatch(/billed, not what the result was/);
    expect(note.resolution).toMatch(/chart|order the test/);
  });

  it("gives a predicate-specific reason, not a generic one", () => {
    expect(explainCeiling("claims", "biomarker")!.because).toMatch(/assay was billed/);
    expect(explainCeiling("claims", "performance_status")!.because).toMatch(/never billed/);
    expect(explainCeiling("claims", "staging")!.because).toMatch(/scan was billed/);
  });

  it("says patient report decides nothing either way", () => {
    const note = explainCeiling("patient_reported", "prior_therapy")!;
    expect(note.note).toMatch(/decides nothing either way/);
    expect(note.ceiling).toBe("no_verdict");
  });

  it("returns nothing when the source is unrestricted", () => {
    expect(explainCeiling("chart", "lab_value")).toBeUndefined();
    expect(explainCeiling("claims", "prior_therapy")).toBeUndefined();
  });
});

/* ------------------------------------------------------- claims cannot confirm */

const labLeaf = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  tier: 1,
  sourceSpan: "ANC >= 1500/uL",
});

const withFact = (f: Fact, l = labLeaf) =>
  evaluate(patient({ id: "PT-1", age: 60, facts: [f] }), trial({ criteria: [l] }), ASOF).cells[0];

describe("claims on a lab value", () => {
  const passing = (provenance: Fact["provenance"]) =>
    fact({
      predicate: "lab_value",
      analyte: "ANC",
      value: 4000,
      unit: "/uL",
      provenance,
      sourceQuote: "CBC with differential, billed 2026-09-20",
    });

  it("never reaches PASS, however favourable the number looks", () => {
    const cell = withFact(passing("claims"));
    expect(cell.verdict).toBe("UNKNOWN");
    expect(cell.verdict).not.toBe("PASS");
    expect(cell.reason).toBe("unsupported");
  });

  it("reaches PASS from the chart with the identical number", () => {
    // The only difference between these two cells is the provenance field.
    expect(withFact(passing("chart")).verdict).toBe("PASS");
  });

  it("still rules the criterion out when the value misses", () => {
    const cell = withFact({ ...passing("claims"), value: 400 });
    expect(cell.verdict).toBe("FAIL");
    expect(cell.reason).toBe("contradicted");
  });

  it("keeps citing what claims did say, so the UI can show it", () => {
    expect(withFact(passing("claims")).chartCitation).toBe(
      "CBC with differential, billed 2026-09-20",
    );
  });

  it("hands back the note explaining the ceiling", () => {
    const { provenanceNotes } = evaluateWithNotes(
      patient({ id: "PT-1", age: 60, facts: [passing("claims")] }),
      trial({ criteria: [labLeaf] }),
      ASOF,
    );
    expect(provenanceNotes["INC-anc"]).toMatchObject({
      provenance: "claims",
      predicate: "lab_value",
      ceiling: "no_confirm",
    });
  });

  it("emits no note for a cell nothing capped", () => {
    const { provenanceNotes } = evaluateWithNotes(
      patient({ id: "PT-1", age: 60, facts: [passing("chart")] }),
      trial({ criteria: [labLeaf] }),
      ASOF,
    );
    expect(provenanceNotes).toEqual({});
  });

  it("is distinguishable from an empty record, because the actions differ", () => {
    // absent → order the test. unsupported → request the records. Not the same job.
    expect(withFact(passing("claims")).reason).toBe("unsupported");
    const empty = evaluate(patient({ id: "PT-1", age: 60 }), trial({ criteria: [labLeaf] }), ASOF);
    expect(empty.cells[0].reason).toBe("absent");
  });
});

describe("claims on the other unconfirmable predicates", () => {
  const cases: { predicate: Predicate; l: ReturnType<typeof leaf>; f: Fact }[] = [
    {
      predicate: "biomarker",
      l: leaf({ id: "X", predicate: "biomarker", analyte: "EGFR", operator: "==", value: "L858R", tier: 0 }),
      f: fact({ predicate: "biomarker", analyte: "EGFR", value: "L858R", provenance: "claims" }),
    },
    {
      predicate: "performance_status",
      l: leaf({ id: "X", predicate: "performance_status", analyte: "ECOG", operator: "<=", value: 1, tier: 1 }),
      f: fact({ predicate: "performance_status", analyte: "ECOG", value: 0, provenance: "claims" }),
    },
    {
      predicate: "staging",
      l: leaf({ id: "X", predicate: "staging", operator: "in", value: ["IIIA", "IIIB"], tier: 2 }),
      f: fact({ predicate: "staging", value: "IIIA", provenance: "claims" }),
    },
  ];

  it.each(cases)("caps a satisfying $predicate claim at UNKNOWN", ({ l, f }) => {
    const cell = withFact(f, l);
    expect(cell.verdict).toBe("UNKNOWN");
    expect(cell.reason).toBe("unsupported");
  });

  it.each(cases)("reaches PASS on $predicate from the chart instead", ({ l, f }) => {
    expect(withFact({ ...f, provenance: "chart" }, l).verdict).toBe("PASS");
  });
});

describe("claims on what a claim really does record", () => {
  it("confirms prior therapy from a dispense", () => {
    const l = leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      value: ["osimertinib"],
      tier: 0,
      sourceSpan: "Prior treatment with osimertinib",
    });
    const f = fact({
      predicate: "prior_therapy",
      value: "osimertinib",
      provenance: "claims",
      sourceQuote: "Pharmacy claim: osimertinib 80 mg, 30-day fill, 2025-04-02",
    });
    expect(withFact(f, l).verdict).toBe("PASS");
  });

  it("fires an exclusion from claims alone, so nobody is enrolled on a missed drug", () => {
    const l = leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      value: ["osimertinib"],
      tier: 0,
    });
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [fact({ predicate: "prior_therapy", value: "osimertinib", provenance: "claims" })],
    });
    expect(evaluate(p, trial({ criteria: [l] }), ASOF).eliminated).toBe(true);
  });

  it("confirms a coded diagnosis and comorbidity", () => {
    const dx = leaf({ id: "X", predicate: "diagnosis", operator: "==", value: "NSCLC", tier: 0 });
    expect(withFact(fact({ predicate: "diagnosis", value: "NSCLC", provenance: "claims" }), dx).verdict).toBe("PASS");
    const cm = leaf({ id: "X", predicate: "comorbidity", operator: "==", value: "COPD", tier: 0 });
    expect(withFact(fact({ predicate: "comorbidity", value: "COPD", provenance: "claims" }), cm).verdict).toBe("PASS");
  });

  it("confirms a washout date, where the pharmacy feed often beats the chart", () => {
    const l = leaf({ id: "W", predicate: "washout", operator: ">=", value: 21, unit: "days", tier: 4 });
    const f = fact({
      predicate: "washout",
      value: "2026-06-01",
      provenance: "claims",
      sourceQuote: "Last pharmacy fill 2026-06-01",
    });
    expect(withFact(f, l).verdict).toBe("PASS");
  });

  it("confirms a concomitant contraindication from a dispense", () => {
    const l = leaf({
      id: "EXC-2",
      type: "exclusion",
      predicate: "contraindication",
      operator: "==",
      value: "strong CYP3A4 inducer",
      tier: 1,
    });
    const f = fact({
      predicate: "contraindication",
      value: "strong CYP3A4 inducer",
      provenance: "claims",
    });
    expect(withFact(f, l).verdict).toBe("PASS");
  });
});

/* --------------------------------------------------------- patient report */

describe("patient report", () => {
  it("cannot confirm a criterion", () => {
    const f = fact({
      predicate: "lab_value",
      analyte: "ANC",
      value: 4000,
      unit: "/uL",
      provenance: "patient_reported",
      sourceQuote: "Patient says their counts were fine last week",
    });
    expect(withFact(f).verdict).toBe("UNKNOWN");
  });

  it("cannot rule one out either — it decides nothing in either direction", () => {
    // This is the difference from claims, and it is deliberate. A patient saying
    // "no" must not clear an exclusion any more than "yes" may fire one.
    const f = fact({
      predicate: "lab_value",
      analyte: "ANC",
      value: 400,
      unit: "/uL",
      provenance: "patient_reported",
    });
    const cell = withFact(f);
    expect(cell.verdict).toBe("UNKNOWN");
    expect(cell.verdict).not.toBe("FAIL");
  });

  it("does not clear an exclusion by denying it", () => {
    const l = leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      value: ["osimertinib"],
      tier: 0,
    });
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [
        fact({
          predicate: "prior_therapy",
          value: "carboplatin",
          provenance: "patient_reported",
          sourceQuote: "Patient recalls only chemotherapy",
        }),
      ],
    });
    const cell = evaluate(p, trial({ criteria: [l] }), ASOF).cells[0];
    expect(cell.verdict).toBe("UNKNOWN");
    expect(cell.reason).toBe("unsupported");
  });

  it("does not fire an exclusion by asserting it, either", () => {
    const l = leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      value: ["osimertinib"],
      tier: 0,
    });
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [
        fact({ predicate: "prior_therapy", value: "osimertinib", provenance: "patient_reported" }),
      ],
    });
    const result = evaluate(p, trial({ criteria: [l] }), ASOF);
    expect(result.cells[0].verdict).toBe("UNKNOWN");
    expect(result.eliminated).toBe(false); // a human checks the chart instead
  });

  it("still surfaces what the patient said, which is why you go and look", () => {
    const f = fact({
      predicate: "lab_value",
      analyte: "ANC",
      value: 4000,
      unit: "/uL",
      provenance: "patient_reported",
      sourceQuote: "Patient says their counts were fine last week",
    });
    expect(withFact(f).chartCitation).toBe("Patient says their counts were fine last week");
  });
});

/* -------------------------------------------------- mixed-provenance records */

describe("a record with more than one source", () => {
  const claimsToday = fact({
    predicate: "lab_value",
    analyte: "ANC",
    value: 4000,
    unit: "/uL",
    observedAt: "2026-09-24",
    provenance: "claims",
    sourceQuote: "CBC billed 2026-09-24",
  });
  const chartLastWeek = fact({
    predicate: "lab_value",
    analyte: "ANC",
    value: 3000,
    unit: "/uL",
    observedAt: "2026-09-18",
    provenance: "chart",
    sourceQuote: "CBC 2026-09-18: ANC 3000/uL",
  });

  it("falls through a newer claim to an older chart result that can answer", () => {
    // Newest-wins must not let "a CBC was billed today" hide last week's result.
    const p = patient({ id: "PT-1", age: 60, facts: [claimsToday, chartLastWeek] });
    const cell = evaluate(p, trial({ criteria: [labLeaf] }), ASOF).cells[0];
    expect(cell.verdict).toBe("PASS");
    expect(cell.chartCitation).toBe("CBC 2026-09-18: ANC 3000/uL");
  });

  it("prefers the newest chart result when there are several", () => {
    const older = { ...chartLastWeek, value: 200, observedAt: "2026-09-10", sourceQuote: "old" };
    const p = patient({ id: "PT-1", age: 60, facts: [claimsToday, chartLastWeek, older] });
    expect(evaluate(p, trial({ criteria: [labLeaf] }), ASOF).cells[0].chartCitation).toBe(
      "CBC 2026-09-18: ANC 3000/uL",
    );
  });

  it("caps at UNKNOWN when every source is a claim", () => {
    const p = patient({ id: "PT-1", age: 60, facts: [claimsToday, { ...claimsToday, observedAt: "2026-09-01" }] });
    expect(evaluate(p, trial({ criteria: [labLeaf] }), ASOF).cells[0].verdict).toBe("UNKNOWN");
  });

  it("lets a claim rule out even when a chart fact is also present but stale", () => {
    const windowed = { ...labLeaf, maxAgeDays: 14 };
    const staleChart = { ...chartLastWeek, observedAt: "2024-01-01" };
    const failingClaim = { ...claimsToday, value: 300 };
    const p = patient({ id: "PT-1", age: 60, facts: [failingClaim, staleChart] });
    expect(evaluate(p, trial({ criteria: [windowed] }), ASOF).cells[0].verdict).toBe("FAIL");
  });

  it("finds one satisfying chart fact among several claims, for a set-valued predicate", () => {
    const l = leaf({
      id: "EXC-1",
      type: "exclusion",
      predicate: "biomarker",
      analyte: "ALK",
      operator: "==",
      value: "rearranged",
      tier: 0,
    });
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [
        fact({ predicate: "biomarker", analyte: "ALK", value: "rearranged", provenance: "claims", observedAt: "2026-09-24", sourceQuote: "FISH billed" }),
        fact({ predicate: "biomarker", analyte: "ALK", value: "rearranged", provenance: "chart", observedAt: "2026-01-02", sourceQuote: "FISH: ALK rearranged" }),
      ],
    });
    const cell = evaluate(p, trial({ criteria: [l] }), ASOF).cells[0];
    expect(cell.verdict).toBe("PASS");
    expect(cell.chartCitation).toBe("FISH: ALK rearranged");
  });
});

/* ------------------------------------------------------------ the invariants */

describe("the invariants — no capped source ever produces a favourable verdict", () => {
  /** Every predicate, with a leaf and a fact that would satisfy it. */
  const satisfying: { predicate: Predicate; l: ReturnType<typeof leaf>; value: Fact["value"] }[] = [
    { predicate: "age", l: leaf({ id: "L", predicate: "age", operator: ">=", value: 18 }), value: 60 },
    { predicate: "lab_value", l: leaf({ id: "L", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500 }), value: 4000 },
    { predicate: "biomarker", l: leaf({ id: "L", predicate: "biomarker", analyte: "EGFR", operator: "==", value: "L858R" }), value: "L858R" },
    { predicate: "prior_therapy", l: leaf({ id: "L", predicate: "prior_therapy", operator: "in", value: ["osimertinib"] }), value: "osimertinib" },
    { predicate: "performance_status", l: leaf({ id: "L", predicate: "performance_status", analyte: "ECOG", operator: "<=", value: 1 }), value: 0 },
    { predicate: "diagnosis", l: leaf({ id: "L", predicate: "diagnosis", operator: "==", value: "NSCLC" }), value: "NSCLC" },
    { predicate: "staging", l: leaf({ id: "L", predicate: "staging", operator: "in", value: ["IIIA"] }), value: "IIIA" },
    { predicate: "washout", l: leaf({ id: "L", predicate: "washout", operator: ">=", value: 21 }), value: "2026-01-01" },
    { predicate: "comorbidity", l: leaf({ id: "L", predicate: "comorbidity", operator: "==", value: "COPD" }), value: "COPD" },
    { predicate: "contraindication", l: leaf({ id: "L", predicate: "contraindication", operator: "==", value: "warfarin" }), value: "warfarin" },
  ];

  it("covers every predicate in the contract", () => {
    expect(satisfying.map((s) => s.predicate).sort()).toEqual([...ALL_PREDICATES].sort());
  });

  it.each(satisfying)("$predicate: the chart confirms it", ({ predicate, l, value }) => {
    const f = fact({ predicate, analyte: l.analyte, value, provenance: "chart" });
    expect(evaluateLeaf(l, patient({ id: "PT-1", age: 60, facts: [f] }), ASOF).verdict).toBe("PASS");
  });

  it.each(satisfying)(
    "$predicate: a claim confirms it only where a claim records it",
    ({ predicate, l, value }) => {
      const f = fact({ predicate, analyte: l.analyte, value, provenance: "claims" });
      const out = evaluateLeaf(l, patient({ id: "PT-1", age: 60, facts: [f] }), ASOF);
      const expected: Verdict = CONFIRMABLE.includes(predicate) ? "PASS" : "UNKNOWN";
      expect(out.verdict, predicate).toBe(expected);
    },
  );

  it.each(satisfying)("$predicate: patient report confirms nothing", ({ predicate, l, value }) => {
    const f = fact({ predicate, analyte: l.analyte, value, provenance: "patient_reported" });
    const out = evaluateLeaf(l, patient({ id: "PT-1", age: 60, facts: [f] }), ASOF);
    expect(out.verdict, predicate).toBe("UNKNOWN");
    expect(out.provenanceNote?.ceiling).toBe("no_verdict");
  });

  it("a capped cell never eliminates the patient, whatever the criterion type", () => {
    for (const { predicate, l, value } of satisfying) {
      for (const provenance of ["claims", "patient_reported"] as const) {
        if (provenance === "claims" && CONFIRMABLE.includes(predicate)) continue;
        for (const type of ["inclusion", "exclusion"] as const) {
          const f = fact({ predicate, analyte: l.analyte, value, provenance });
          const t = trial({ criteria: [{ ...l, type }] });
          const r = evaluate(patient({ id: "PT-1", age: 60, facts: [f] }), t, ASOF);
          expect(r.eliminated, `${predicate}/${provenance}/${type}`).toBe(false);
        }
      }
    }
  });

  it("a capped cell counts as an unknown, so it is priced as resolvable work", () => {
    const f = fact({
      predicate: "lab_value",
      analyte: "ANC",
      value: 4000,
      unit: "/uL",
      provenance: "claims",
    });
    const r = evaluate(patient({ id: "PT-1", age: 60, facts: [f] }), trial({ criteria: [labLeaf] }), ASOF);
    expect(r.unknownCount).toBe(1);
    expect(r.resolutionCost).toBeGreaterThan(0);
  });

  it("holds through a nested OR, where a capped branch must not carry the group", () => {
    const l858r = leaf({ id: "A", predicate: "biomarker", analyte: "EGFR", operator: "==", value: "L858R", tier: 0 });
    const ex19 = leaf({ id: "B", predicate: "biomarker", analyte: "EGFR", operator: "==", value: "ex19del", tier: 0 });
    const either = group("OR", [l858r, ex19], "EGFR L858R or exon 19 deletion");
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [fact({ predicate: "biomarker", analyte: "EGFR", value: "L858R", provenance: "claims" })],
    });
    const r = evaluate(p, trial({ criteria: [either] }), ASOF);
    // The L858R branch would have passed, so it is capped to UNKNOWN. The
    // exon-19 branch is ruled out, which claims ARE allowed to do. Under Kleene
    // that is OR(UNKNOWN, FAIL) = UNKNOWN: the group never reaches PASS off
    // billing data, and a capped branch cannot carry it.
    expect(r.cells.find((c) => c.criterionId === "A")!.verdict).toBe("UNKNOWN");
    expect(r.cells.find((c) => c.criterionId === "B")!.verdict).toBe("FAIL");
    expect(r.passCount).toBe(0);
    expect(r.eliminated).toBe(false);
  });

  it("caps every branch of an OR when claims cannot distinguish the results", () => {
    // Two branches the claim would have satisfied: both capped, group UNKNOWN.
    const a = leaf({ id: "A", predicate: "biomarker", analyte: "EGFR", operator: "in", value: ["L858R"], tier: 0 });
    const b = leaf({ id: "B", predicate: "biomarker", analyte: "EGFR", operator: "in", value: ["L858R", "ex19del"], tier: 0 });
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [fact({ predicate: "biomarker", analyte: "EGFR", value: "L858R", provenance: "claims" })],
    });
    const r = evaluate(p, trial({ criteria: [group("OR", [a, b])] }), ASOF);
    expect(r.cells.map((c) => c.verdict)).toEqual(["UNKNOWN", "UNKNOWN"]);
    expect(r.passCount).toBe(0);
  });

  it("does not change anything for a chart-only record", () => {
    // The regression guard: the rules are inert when every fact is from the chart.
    const p = patient({
      id: "PT-1",
      age: 60,
      facts: [fact({ predicate: "lab_value", analyte: "ANC", value: 4000, unit: "/uL" })],
    });
    expect(evaluate(p, trial({ criteria: [labLeaf] }), ASOF).cells[0].verdict).toBe("PASS");
  });

  it("defaults to chart when a fixture omits provenance, per the contract's default", () => {
    // Fact.provenance has .default("chart"), so an older fixture keeps working.
    const f = fact({ predicate: "lab_value", analyte: "ANC", value: 4000, unit: "/uL" });
    expect(f.provenance).toBe("chart");
  });
});
