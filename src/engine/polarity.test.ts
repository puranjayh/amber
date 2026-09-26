/**
 * THE POLARITY SUITE. Non-negotiable.
 *
 * One claim, asserted from every angle: if a fact matches an exclusion
 * criterion, the patient FAILS that criterion and is out of the trial. Never
 * PASS. Never eligible. Never quietly favourable.
 *
 * Why this suite exists: an inverted exclusion is the one bug in this system
 * that puts the wrong patient on a trial. Every other bug shows up as a missed
 * match or an ugly table. This one shows up as harm. It is also the easiest
 * inversion to introduce, because exclusions are stated in the negative in
 * protocol prose and read in the positive by the engine.
 *
 * On polarity, see the header of evaluate.ts. `CubeCell.verdict` is written in
 * criterion polarity — "did the exclusion fire" — because that is the only
 * reading under which nested groups compose correctly. The patient-facing
 * reading comes from `eligibilityVerdict()`, and it is the one asserted here,
 * so this file states the claim in exactly the words it was specified in.
 */
import { describe, expect, it } from "vitest";
import type { CriterionLeaf, Fact, Predicate, Verdict } from "@/src/contracts";
import { blockingCriterionIds, eligibilityVerdict, evaluate, evaluateLeaf } from "./evaluate";
import { assertValid, fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/**
 * One exclusion criterion per predicate, each paired with a fact that matches
 * it. Every `Predicate` in the contract appears, so adding a predicate to the
 * enum without covering it here trips the completeness test at the bottom.
 */
interface Case {
  what: string;
  leaf: CriterionLeaf;
  /** A fact that matches the exclusion — the patient must be out. */
  matching: Fact;
  /** A fact that speaks to the same criterion and does not match it. */
  clearing: Fact;
}

const CASES: Case[] = [
  {
    what: "age ceiling",
    leaf: leaf({
      id: "EXC-age",
      type: "exclusion",
      predicate: "age",
      operator: ">",
      value: 75,
      unit: "years",
      sourceSpan: "Age greater than 75 years",
    }),
    matching: fact({ predicate: "age", value: 81, unit: "years", sourceQuote: "81-year-old man" }),
    clearing: fact({ predicate: "age", value: 61, unit: "years", sourceQuote: "61-year-old man" }),
  },
  {
    what: "lab value out of range",
    leaf: leaf({
      id: "EXC-lab",
      type: "exclusion",
      predicate: "lab_value",
      analyte: "total bilirubin",
      operator: ">",
      value: 1.5,
      unit: "mg/dL",
      maxAgeDays: 28,
      tier: 1,
      sourceSpan: "Total bilirubin greater than 1.5 mg/dL",
    }),
    matching: fact({
      predicate: "lab_value",
      analyte: "total bilirubin",
      value: 3.2,
      unit: "mg/dL",
      observedAt: "2026-09-20",
      sourceQuote: "Total bilirubin 3.2 mg/dL",
    }),
    clearing: fact({
      predicate: "lab_value",
      analyte: "total bilirubin",
      value: 0.7,
      unit: "mg/dL",
      observedAt: "2026-09-20",
      sourceQuote: "Total bilirubin 0.7 mg/dL",
    }),
  },
  {
    what: "disqualifying biomarker",
    leaf: leaf({
      id: "EXC-bio",
      type: "exclusion",
      predicate: "biomarker",
      analyte: "ALK",
      operator: "==",
      value: "rearranged",
      tier: 0,
      sourceSpan: "Known ALK rearrangement",
    }),
    matching: fact({
      predicate: "biomarker",
      analyte: "ALK",
      value: "rearranged",
      sourceQuote: "FISH: ALK rearrangement detected",
    }),
    clearing: fact({
      predicate: "biomarker",
      analyte: "ALK",
      value: "wild type",
      sourceQuote: "FISH: no ALK rearrangement",
    }),
  },
  {
    what: "prior therapy in a drug class",
    leaf: leaf({
      id: "EXC-tx",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      drugClass: "EGFR_TKI",
      members: ["osimertinib", "erlotinib", "gefitinib", "afatinib"],
      value: ["osimertinib", "erlotinib", "gefitinib", "afatinib"],
      tier: 0,
      sourceSpan: "Prior treatment with any EGFR tyrosine kinase inhibitor",
    }),
    matching: fact({
      predicate: "prior_therapy",
      value: "osimertinib",
      observedAt: "2025-04-02",
      sourceQuote: "started osimertinib 80 mg daily in April 2025",
    }),
    clearing: fact({
      predicate: "prior_therapy",
      value: "carboplatin",
      observedAt: "2025-04-02",
      sourceQuote: "four cycles of carboplatin and pemetrexed",
    }),
  },
  {
    what: "performance status too poor",
    leaf: leaf({
      id: "EXC-ps",
      type: "exclusion",
      predicate: "performance_status",
      analyte: "ECOG",
      operator: ">=",
      value: 2,
      maxAgeDays: 28,
      tier: 1,
      sourceSpan: "ECOG performance status of 2 or greater",
    }),
    matching: fact({
      predicate: "performance_status",
      analyte: "ECOG",
      value: 3,
      observedAt: "2026-09-18",
      sourceQuote: "ECOG 3, largely bedbound",
    }),
    clearing: fact({
      predicate: "performance_status",
      analyte: "ECOG",
      value: 1,
      observedAt: "2026-09-18",
      sourceQuote: "ECOG 1, fully ambulatory",
    }),
  },
  {
    what: "wrong diagnosis",
    leaf: leaf({
      id: "EXC-dx",
      type: "exclusion",
      predicate: "diagnosis",
      operator: "==",
      value: "small cell lung cancer",
      tier: 0,
      sourceSpan: "Histologically confirmed small cell lung cancer",
    }),
    matching: fact({
      predicate: "diagnosis",
      value: "small cell lung cancer",
      sourceQuote: "Pathology: small cell lung cancer",
    }),
    clearing: fact({
      predicate: "diagnosis",
      value: "adenocarcinoma",
      sourceQuote: "Pathology: invasive adenocarcinoma",
    }),
  },
  {
    what: "disqualifying stage",
    leaf: leaf({
      id: "EXC-stage",
      type: "exclusion",
      predicate: "staging",
      operator: "in",
      value: ["IVA", "IVB"],
      tier: 2,
      sourceSpan: "Stage IV disease",
    }),
    matching: fact({ predicate: "staging", value: "IVB", sourceQuote: "Stage IVB at presentation" }),
    clearing: fact({ predicate: "staging", value: "IIIA", sourceQuote: "Stage IIIA at presentation" }),
  },
  {
    what: "washout not complete",
    leaf: leaf({
      id: "EXC-wash",
      type: "exclusion",
      predicate: "washout",
      operator: "<",
      value: 21,
      unit: "days",
      tier: 4,
      sourceSpan: "Systemic therapy within 21 days before the first dose",
    }),
    matching: fact({
      predicate: "washout",
      value: "2026-09-20",
      sourceQuote: "last dose of pemetrexed 20 September 2026",
    }),
    clearing: fact({
      predicate: "washout",
      value: "2026-05-01",
      sourceQuote: "last dose of pemetrexed 1 May 2026",
    }),
  },
  {
    what: "comorbidity",
    leaf: leaf({
      id: "EXC-comorb",
      type: "exclusion",
      predicate: "comorbidity",
      operator: "in",
      value: ["interstitial lung disease", "active hepatitis B"],
      tier: 2,
      sourceSpan: "History of interstitial lung disease or active hepatitis B",
    }),
    matching: fact({
      predicate: "comorbidity",
      value: "interstitial lung disease",
      sourceQuote: "CT shows established interstitial lung disease",
    }),
    clearing: fact({
      predicate: "comorbidity",
      value: "hypertension",
      sourceQuote: "well-controlled hypertension",
    }),
  },
  {
    what: "contraindication",
    leaf: leaf({
      id: "EXC-contra",
      type: "exclusion",
      predicate: "contraindication",
      operator: "==",
      value: "strong CYP3A4 inducer",
      tier: 1,
      sourceSpan: "Concomitant use of a strong CYP3A4 inducer",
    }),
    matching: fact({
      predicate: "contraindication",
      value: "strong CYP3A4 inducer",
      sourceQuote: "on rifampicin, a strong CYP3A4 inducer",
    }),
    clearing: fact({
      predicate: "contraindication",
      value: "none identified",
      sourceQuote: "no interacting medications on review",
    }),
  },
];

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

/** Age lives on the patient record, so an age case must set it there too. */
const subjectFor = (f: Fact) =>
  f.predicate === "age"
    ? patient({ id: "PT-POL", age: Number(f.value), facts: [f] })
    : patient({ id: "PT-POL", facts: [f] });

describe.each(CASES)("exclusion — $what", (c) => {
  const t = trial({ nctId: "NCT00000042", criteria: [c.leaf] });

  it("is a valid fixture under the frozen schemas", () => {
    expect(() => assertValid(t, [subjectFor(c.matching), subjectFor(c.clearing)])).not.toThrow();
  });

  it("a matching fact yields FAIL, and never PASS", () => {
    const r = evaluate(subjectFor(c.matching), t, ASOF);
    const cell = r.cells[0];
    const patientFacing: Verdict = eligibilityVerdict(cell.verdict, "exclusion");

    expect(patientFacing).toBe("FAIL");
    expect(patientFacing).not.toBe("PASS");
  });

  it("a matching fact eliminates the patient from the trial", () => {
    const r = evaluate(subjectFor(c.matching), t, ASOF);
    expect(r.eliminated).toBe(true);
    expect(blockingCriterionIds(t, r)).toEqual([c.leaf.id]);
  });

  it("a matching fact is never counted as a favourable cell", () => {
    const r = evaluate(subjectFor(c.matching), t, ASOF);
    expect(eligibilityVerdict(r.cells[0].verdict, "exclusion")).not.toBe("PASS");
    // And it does not masquerade as an unresolved question either.
    expect(r.unknownCount).toBe(0);
  });

  it("cites both the protocol and the record for the elimination", () => {
    const cell = evaluate(subjectFor(c.matching), t, ASOF).cells[0];
    expect(cell.criterionCitation).toBe(c.leaf.sourceSpan);
    expect(cell.chartCitation).toBe(c.matching.sourceQuote);
  });

  it("a clearing fact does not eliminate the patient", () => {
    const r = evaluate(subjectFor(c.clearing), t, ASOF);
    expect(eligibilityVerdict(r.cells[0].verdict, "exclusion")).toBe("PASS");
    expect(r.eliminated).toBe(false);
  });

  it("silence is UNKNOWN — the exclusion neither fires nor clears", () => {
    // The age case reads the demographics field, so it is genuinely never silent.
    if (c.leaf.predicate === "age") return;
    const r = evaluate(patient({ id: "PT-POL" }), t, ASOF);
    expect(r.cells[0].verdict).toBe("UNKNOWN");
    expect(r.cells[0].reason).toBe("absent");
    expect(eligibilityVerdict(r.cells[0].verdict, "exclusion")).toBe("UNKNOWN");
    expect(r.eliminated).toBe(false);
  });

  it("a stale matching fact is UNKNOWN, not an elimination", () => {
    if (c.leaf.maxAgeDays === undefined) return;
    const old = { ...c.matching, observedAt: "2024-01-05" };
    const r = evaluate(subjectFor(old), t, ASOF);
    expect(r.cells[0].verdict).toBe("UNKNOWN");
    expect(r.cells[0].reason).toBe("stale");
    expect(r.eliminated).toBe(false);
  });
});

describe("polarity holds through nesting", () => {
  const tki = CASES.find((c) => c.what === "prior therapy in a drug class")!;
  const ild = CASES.find((c) => c.what === "comorbidity")!;

  it("an OR of exclusions fires on either branch — the OR is not silently an AND", () => {
    const t = trial({
      nctId: "NCT00000043",
      criteria: [group("OR", [tki.leaf, ild.leaf], "Prior EGFR TKI or interstitial lung disease")],
    });
    // Only one of the two conditions is present. An inverted polarity would
    // turn this OR into an AND and let the patient through.
    for (const c of [tki, ild]) {
      const r = evaluate(subjectFor(c.matching), t, ASOF);
      expect(r.eliminated, `${c.what} alone must still eliminate`).toBe(true);
    }
  });

  it("an AND of exclusions still fires when only part of it is documented", () => {
    // "excluded if prior TKI and ILD": with one arm matched and the other
    // silent, the AND is UNKNOWN, so the patient is not yet excluded — but the
    // matched arm is never reported as favourable.
    const t = trial({ nctId: "NCT00000044", criteria: [group("AND", [tki.leaf, ild.leaf])] });
    const r = evaluate(subjectFor(tki.matching), t, ASOF);
    expect(r.eliminated).toBe(false);
    const tkiCell = r.cells.find((x) => x.criterionId === tki.leaf.id)!;
    expect(eligibilityVerdict(tkiCell.verdict, "exclusion")).toBe("FAIL");
  });

  it("an exclusion buried deep in a tree still eliminates", () => {
    const t = trial({
      nctId: "NCT00000045",
      criteria: [
        leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 }),
        group("AND", [group("OR", [group("AND", [tki.leaf])])]),
      ],
    });
    expect(evaluate(subjectFor(tki.matching), t, ASOF).eliminated).toBe(true);
  });

  it("an exclusion sitting beside satisfied inclusions is not outvoted by them", () => {
    const t = trial({
      nctId: "NCT00000046",
      criteria: [
        leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18, sourceSpan: "Age >= 18" }),
        leaf({ id: "INC-1", predicate: "diagnosis", operator: "==", value: "adenocarcinoma", sourceSpan: "Adenocarcinoma" }),
        tki.leaf,
      ],
    });
    const p = patient({
      id: "PT-POL",
      age: 64,
      facts: [fact({ predicate: "diagnosis", value: "adenocarcinoma" }), tki.matching],
    });
    const r = evaluate(p, t, ASOF);
    expect(r.eliminated).toBe(true);
    expect(r.passCount).toBeGreaterThan(0); // inclusions did pass — and it does not matter
  });
});

describe("the suite covers every predicate in the contract", () => {
  it("has an exclusion case for each one", () => {
    const covered = new Set(CASES.map((c) => c.leaf.predicate));
    const missing = ALL_PREDICATES.filter((p) => !covered.has(p));
    expect(missing, "add a polarity case for these predicates").toEqual([]);
  });

  it("every case's matching fact really does match, at the leaf level", () => {
    for (const c of CASES) {
      const out = evaluateLeaf(c.leaf, subjectFor(c.matching), ASOF);
      expect(out.verdict, `${c.what}: matching fact must resolve, not fall through`).toBe("PASS");
      expect(out.reason).toBe("satisfied");
    }
  });

  it("every case's clearing fact really does clear, at the leaf level", () => {
    for (const c of CASES) {
      const out = evaluateLeaf(c.leaf, subjectFor(c.clearing), ASOF);
      expect(out.verdict, `${c.what}: clearing fact must resolve, not fall through`).toBe("FAIL");
      expect(out.reason).toBe("contradicted");
    }
  });
});
