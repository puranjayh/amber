import { describe, expect, it } from "vitest";
import { TIER_WEIGHT } from "@/src/contracts";
import {
  blockingCriterionIds,
  criterionType,
  eligibilityVerdict,
  evaluate,
  evaluateAll,
  evaluateLeaf,
  indexLeaves,
  isEliminating,
} from "./evaluate";
import { assertValid, fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

const cellOf = (r: ReturnType<typeof evaluate>, id: string) => {
  const c = r.cells.find((x) => x.criterionId === id);
  if (!c) throw new Error(`no cell for ${id}`);
  return c;
};

/* ------------------------------------------------------------------- absence */

describe("absent facts", () => {
  const anc = leaf({
    id: "INC-1",
    predicate: "lab_value",
    analyte: "ANC",
    operator: ">=",
    value: 1500,
    unit: "/uL",
    maxAgeDays: 14,
    tier: 1,
    sourceSpan: "ANC >= 1500/uL within 14 days of enrolment",
  });

  it("is UNKNOWN / absent, never FAIL, when the record is silent", () => {
    const r = evaluate(patient(), trial({ criteria: [anc] }), ASOF);
    const c = cellOf(r, "INC-1");
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("absent");
    expect(r.failCount).toBe(0);
    expect(r.eliminated).toBe(false);
  });

  it("carries no chart citation when there is nothing to cite", () => {
    const r = evaluate(patient(), trial({ criteria: [anc] }), ASOF);
    expect(cellOf(r, "INC-1").chartCitation).toBeUndefined();
  });

  it("is absent, not unsupported, when the patient has facts about other analytes", () => {
    const p = patient({
      facts: [fact({ predicate: "lab_value", analyte: "albumin", value: 4.1, unit: "g/dL" })],
    });
    expect(cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1").reason).toBe("absent");
  });

  it("does not let an absent fact eliminate the patient from the trial", () => {
    const exc = leaf({ id: "EXC-1", type: "exclusion", predicate: "prior_therapy", operator: "in", value: ["osimertinib"] });
    const r = evaluate(patient(), trial({ criteria: [anc, exc] }), ASOF);
    expect(r.eliminated).toBe(false);
    expect(r.unknownCount).toBe(2);
  });
});

/* -------------------------------------------------------------------- staleness */

describe("staleness", () => {
  const anc = leaf({
    id: "INC-1",
    predicate: "lab_value",
    analyte: "ANC",
    operator: ">=",
    value: 1500,
    unit: "/uL",
    maxAgeDays: 14,
  });

  it("is UNKNOWN / stale, never FAIL, past maxAgeDays", () => {
    const p = patient({
      facts: [fact({ analyte: "ANC", value: 900, unit: "/uL", observedAt: "2026-03-12" })],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("stale");
  });

  it("is stale even when the old value would have satisfied the criterion", () => {
    const p = patient({
      facts: [fact({ analyte: "ANC", value: 4200, unit: "/uL", observedAt: "2026-03-12" })],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("stale");
  });

  it("still cites the stale fact and its age, so the UI can say 197 days / window 14", () => {
    const p = patient({
      facts: [
        fact({
          analyte: "ANC",
          value: 900,
          unit: "/uL",
          observedAt: "2026-03-12",
          sourceQuote: "ANC 900/uL",
        }),
      ],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.chartCitation).toBe("ANC 900/uL");
    expect(c.ageDays).toBe(197);
    expect(c.observedAt).toBe("2026-03-12");
  });

  it("counts the window inclusively — exactly maxAgeDays old still counts", () => {
    const onTheDay = patient({
      facts: [fact({ analyte: "ANC", value: 2000, unit: "/uL", observedAt: "2026-09-11" })],
    });
    const dayAfter = patient({
      facts: [fact({ analyte: "ANC", value: 2000, unit: "/uL", observedAt: "2026-09-10" })],
    });
    expect(cellOf(evaluate(onTheDay, trial({ criteria: [anc] }), ASOF), "INC-1").verdict).toBe("PASS");
    expect(cellOf(evaluate(dayAfter, trial({ criteria: [anc] }), ASOF), "INC-1").reason).toBe("stale");
  });

  it("never goes stale when the leaf declares no window", () => {
    const noWindow = leaf({ id: "INC-2", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500 });
    const p = patient({ facts: [fact({ analyte: "ANC", value: 2000, observedAt: "2019-01-01" })] });
    expect(cellOf(evaluate(p, trial({ criteria: [noWindow] }), ASOF), "INC-2").verdict).toBe("PASS");
  });

  it("prefers a fresh fact over a stale one regardless of input order", () => {
    const p = patient({
      facts: [
        fact({ analyte: "ANC", value: 4200, unit: "/uL", observedAt: "2026-09-22", sourceQuote: "ANC 4200" }),
        fact({ analyte: "ANC", value: 100, unit: "/uL", observedAt: "2026-01-02", sourceQuote: "ANC 100" }),
      ],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.verdict).toBe("PASS");
    expect(c.chartCitation).toBe("ANC 4200");
  });

  it("uses the most recent of several fresh labs, not the most favourable", () => {
    const p = patient({
      facts: [
        fact({ analyte: "ANC", value: 4200, unit: "/uL", observedAt: "2026-09-15", sourceQuote: "ANC 4200" }),
        fact({ analyte: "ANC", value: 800, unit: "/uL", observedAt: "2026-09-22", sourceQuote: "ANC 800" }),
      ],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.verdict).toBe("FAIL");
    expect(c.chartCitation).toBe("ANC 800");
  });

  it("treats an undated fact as unproven recency when a window exists", () => {
    const p = patient({ facts: [fact({ analyte: "ANC", value: 4200, unit: "/uL", observedAt: "sometime" })] });
    const c = cellOf(evaluate(p, trial({ criteria: [anc] }), ASOF), "INC-1");
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("stale");
    expect(c.ageDays).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ operators */

describe("operators", () => {
  const withValue = (over: Parameters<typeof leaf>[0], factValue: unknown, extra = {}) =>
    cellOf(
      evaluate(
        patient({ facts: [fact({ predicate: over.predicate ?? "lab_value", value: factValue as never, ...extra })] }),
        trial({ criteria: [leaf(over)] }),
        ASOF,
      ),
      over.id,
    );

  it("compares >= <= > < numerically", () => {
    expect(withValue({ id: "A", operator: ">=", value: 10 }, 10).verdict).toBe("PASS");
    expect(withValue({ id: "A", operator: ">", value: 10 }, 10).verdict).toBe("FAIL");
    expect(withValue({ id: "A", operator: "<=", value: 10 }, 10).verdict).toBe("PASS");
    expect(withValue({ id: "A", operator: "<", value: 10 }, 9).verdict).toBe("PASS");
  });

  it("handles == and != on strings case-insensitively", () => {
    expect(withValue({ id: "A", predicate: "diagnosis", operator: "==", value: "NSCLC" }, "nsclc").verdict).toBe("PASS");
    expect(withValue({ id: "A", predicate: "diagnosis", operator: "!=", value: "NSCLC" }, "nsclc").verdict).toBe("FAIL");
  });

  it("handles positive / negative biomarker strings as booleans", () => {
    expect(
      withValue({ id: "A", predicate: "biomarker", analyte: "EGFR", operator: "==", value: true }, "positive", {
        analyte: "EGFR",
      }).verdict,
    ).toBe("PASS");
  });

  it("refuses to compare mismatched units rather than converting them", () => {
    const c = withValue(
      { id: "A", predicate: "lab_value", analyte: "creatinine", operator: "<=", value: 1.5, unit: "mg/dL" },
      88,
      { analyte: "creatinine", unit: "umol/L" },
    );
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("unsupported");
  });

  it("is unsupported, not FAIL, when a number is compared against prose", () => {
    const c = withValue({ id: "A", operator: ">=", value: 1500, analyte: "ANC" }, "not drawn", { analyte: "ANC" });
    expect(c.verdict).toBe("UNKNOWN");
    expect(c.reason).toBe("unsupported");
  });

  it("is unsupported when an `in` leaf carries no list to test against", () => {
    const c = withValue({ id: "A", predicate: "prior_therapy", operator: "in", value: 3 }, "osimertinib");
    expect(c.reason).toBe("unsupported");
  });

  it("derives washout days from a last-dose date against asOf", () => {
    const l = leaf({ id: "W", predicate: "washout", operator: ">=", value: 21, unit: "days", tier: 4 });
    const cleared = patient({ facts: [fact({ predicate: "washout", value: "2026-08-01" })] });
    const tooSoon = patient({ facts: [fact({ predicate: "washout", value: "2026-09-20" })] });
    expect(cellOf(evaluate(cleared, trial({ criteria: [l] }), ASOF), "W").verdict).toBe("PASS");
    expect(cellOf(evaluate(tooSoon, trial({ criteria: [l] }), ASOF), "W").verdict).toBe("FAIL");
  });
});

/* --------------------------------------------------------- set-valued facts */

describe("set-valued predicates", () => {
  const priorTki = leaf({
    id: "EXC-1",
    type: "exclusion",
    predicate: "prior_therapy",
    operator: "in",
    drugClass: "EGFR_TKI",
    members: ["osimertinib", "erlotinib", "gefitinib"],
    value: ["osimertinib", "erlotinib", "gefitinib"],
    tier: 0,
    sourceSpan: "Prior treatment with an EGFR tyrosine kinase inhibitor",
  });

  it("finds a matching drug anywhere in the therapy history, not just the latest line", () => {
    const p = patient({
      facts: [
        fact({ predicate: "prior_therapy", value: "erlotinib", observedAt: "2024-02-01", sourceQuote: "erlotinib 2024" }),
        fact({ predicate: "prior_therapy", value: "carboplatin", observedAt: "2026-09-01", sourceQuote: "carbo 2026" }),
      ],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [priorTki] }), ASOF), "EXC-1");
    expect(c.verdict).toBe("PASS"); // exclusion fired
    expect(c.chartCitation).toBe("erlotinib 2024");
  });

  it("matches on drug class when the fact names the class rather than the drug", () => {
    const p = patient({ facts: [fact({ predicate: "prior_therapy", value: "unnamed TKI", drugClass: "EGFR_TKI" })] });
    expect(cellOf(evaluate(p, trial({ criteria: [priorTki] }), ASOF), "EXC-1").verdict).toBe("PASS");
  });

  it("is FAIL — exclusion did not fire — when the history holds only other drugs", () => {
    const p = patient({ facts: [fact({ predicate: "prior_therapy", value: "pembrolizumab" })] });
    expect(cellOf(evaluate(p, trial({ criteria: [priorTki] }), ASOF), "EXC-1").verdict).toBe("FAIL");
  });

  it("quantifies not_in universally — one offending drug violates it", () => {
    const noTki = leaf({
      id: "INC-9",
      predicate: "prior_therapy",
      operator: "not_in",
      value: ["osimertinib", "erlotinib"],
    });
    const p = patient({
      facts: [
        fact({ predicate: "prior_therapy", value: "carboplatin" }),
        fact({ predicate: "prior_therapy", value: "osimertinib", sourceQuote: "osimertinib 2025" }),
      ],
    });
    const c = cellOf(evaluate(p, trial({ criteria: [noTki] }), ASOF), "INC-9");
    expect(c.verdict).toBe("FAIL");
    expect(c.chartCitation).toBe("osimertinib 2025");
  });

  it("passes not_in only when every fact clears the list", () => {
    const noTki = leaf({ id: "INC-9", predicate: "prior_therapy", operator: "not_in", value: ["osimertinib"] });
    const p = patient({
      facts: [
        fact({ predicate: "prior_therapy", value: "carboplatin" }),
        fact({ predicate: "prior_therapy", value: "pemetrexed" }),
      ],
    });
    expect(cellOf(evaluate(p, trial({ criteria: [noTki] }), ASOF), "INC-9").verdict).toBe("PASS");
  });
});

/* ------------------------------------------------------------------------ age */

describe("age", () => {
  const eighteenPlus = leaf({
    id: "INC-0",
    predicate: "age",
    operator: ">=",
    value: 18,
    unit: "years",
    sourceSpan: "Age >= 18 years",
  });

  it("reads the structured demographics field when there is no age fact", () => {
    const c = cellOf(evaluate(patient({ age: 64 }), trial({ criteria: [eighteenPlus] }), ASOF), "INC-0");
    expect(c.verdict).toBe("PASS");
    expect(c.chartCitation).toContain("age 64");
    expect(c.chartCitation).toContain("structured demographics");
  });

  it("does not dress the demographics field up as a chart sentence", () => {
    const c = cellOf(evaluate(patient({ age: 64 }), trial({ criteria: [eighteenPlus] }), ASOF), "INC-0");
    expect(c.chartCitation).toMatch(/structured demographics/);
  });

  it("prefers a real age fact, with its own quote, when the record has one", () => {
    const p = patient({
      age: 64,
      facts: [fact({ predicate: "age", value: 64, unit: "years", sourceQuote: "64-year-old woman" })],
    });
    expect(cellOf(evaluate(p, trial({ criteria: [eighteenPlus] }), ASOF), "INC-0").chartCitation).toBe(
      "64-year-old woman",
    );
  });

  it("FAILs an under-age patient — this is a real contradiction, not a silence", () => {
    const c = cellOf(evaluate(patient({ age: 15 }), trial({ criteria: [eighteenPlus] }), ASOF), "INC-0");
    expect(c.verdict).toBe("FAIL");
    expect(c.reason).toBe("contradicted");
  });
});

/* --------------------------------------------------------------- nested logic */

describe("nested boolean groups", () => {
  const l858r = leaf({
    id: "INC-2a",
    predicate: "biomarker",
    analyte: "EGFR",
    operator: "==",
    value: "L858R",
    tier: 0,
    sourceSpan: "EGFR L858R",
  });
  const ex19 = leaf({
    id: "INC-2b",
    predicate: "biomarker",
    analyte: "EGFR",
    operator: "==",
    value: "exon19del",
    tier: 0,
    sourceSpan: "EGFR exon 19 deletion",
  });
  const either = group("OR", [l858r, ex19], "EGFR L858R or exon 19 deletion");

  const withEgfr = (v: string) =>
    patient({ facts: [fact({ predicate: "biomarker", analyte: "EGFR", value: v })] });

  it("does not eliminate when one OR branch fails and the other passes", () => {
    const r = evaluate(withEgfr("L858R"), trial({ criteria: [either] }), ASOF);
    expect(r.eliminated).toBe(false);
    expect(cellOf(r, "INC-2a").verdict).toBe("PASS");
    expect(cellOf(r, "INC-2b").verdict).toBe("FAIL"); // harmless inside the OR
  });

  it("eliminates only when every OR branch is decided against the patient", () => {
    expect(evaluate(withEgfr("ALK fusion"), trial({ criteria: [either] }), ASOF).eliminated).toBe(true);
  });

  it("is UNKNOWN at the group when one branch is silent and none passes", () => {
    // No EGFR fact at all: both leaves absent, so the OR is UNKNOWN, not FAIL.
    const r = evaluate(patient(), trial({ criteria: [either] }), ASOF);
    expect(r.eliminated).toBe(false);
    expect(r.unknownCount).toBe(2);
  });

  it("blames no branch of an OR that failed harmlessly", () => {
    const t = trial({ criteria: [either] });
    expect(blockingCriterionIds(t, evaluate(withEgfr("L858R"), t, ASOF))).toEqual([]);
  });

  it("blames every branch of an OR once the whole group has fired", () => {
    // Relaxing either branch alone would rescue the patient, so both are
    // genuinely holding them out.
    const t = trial({ criteria: [either] });
    expect(blockingCriterionIds(t, evaluate(withEgfr("ALK fusion"), t, ASOF))).toEqual([
      "INC-2a",
      "INC-2b",
    ]);
  });

  it("blames nobody when two independent criteria each eliminate the patient", () => {
    const tooYoung = leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 });
    const t = trial({ criteria: [tooYoung, either] });
    const p = patient({ age: 12, facts: [fact({ predicate: "biomarker", analyte: "EGFR", value: "ALK fusion" })] });
    const r = evaluate(p, t, ASOF);
    expect(r.eliminated).toBe(true);
    expect(blockingCriterionIds(t, r)).toEqual([]); // relaxing any one changes nothing
  });

  it("reads the criterion type off the leaves, and a NOT does not flip it", () => {
    const exc = leaf({ id: "EXC-5", type: "exclusion", predicate: "comorbidity", operator: "==", value: "brain mets" });
    expect(criterionType(exc)).toBe("exclusion");
    // The NOT is logic inside the exclusion section; Kleene already negates the
    // verdict, so negating the type as well would double-negate.
    expect(criterionType(group("NOT", [exc]))).toBe("exclusion");
    expect(criterionType(group("AND", [exc, leaf({ id: "INC-1" })]))).toBe("mixed");
  });

  it("negates a NOT group's rolled-up verdict", () => {
    const hasMets = leaf({
      id: "INC-7",
      predicate: "comorbidity",
      operator: "==",
      value: "brain mets",
      sourceSpan: "No untreated brain metastases",
    });
    const noMets = group("NOT", [hasMets], "No untreated brain metastases");
    const withMets = patient({ facts: [fact({ predicate: "comorbidity", value: "brain mets" })] });
    const without = patient({ facts: [fact({ predicate: "comorbidity", value: "hypertension" })] });
    expect(evaluate(withMets, trial({ criteria: [noMets] }), ASOF).eliminated).toBe(true);
    expect(evaluate(without, trial({ criteria: [noMets] }), ASOF).eliminated).toBe(false);
  });

  it("preserves the tree — every leaf gets its own cell, nothing is flattened away", () => {
    const deep = group("AND", [group("OR", [l858r, ex19]), leaf({ id: "INC-3" })]);
    expect(evaluate(patient(), trial({ criteria: [deep] }), ASOF).cells.map((c) => c.criterionId)).toEqual([
      "INC-2a",
      "INC-2b",
      "INC-3",
    ]);
  });
});

/* ------------------------------------------------------------------ roll-ups */

describe("roll-up", () => {
  const cheapUnknown = leaf({ id: "U0", predicate: "biomarker", analyte: "PD-L1", operator: ">=", value: 50, tier: 0, pFavorable: 0.3 });
  const dearUnknown = leaf({ id: "U3", predicate: "biomarker", analyte: "MET", operator: "==", value: "amplified", tier: 3, pFavorable: 0.6 });
  const settled = leaf({ id: "P1", predicate: "age", operator: ">=", value: 18, tier: 1, pFavorable: 0.9 });

  const r = evaluate(patient({ age: 60 }), trial({ criteria: [cheapUnknown, dearUnknown, settled] }), ASOF);

  it("counts each verdict", () => {
    expect([r.passCount, r.failCount, r.unknownCount]).toEqual([1, 0, 2]);
  });

  it("prices resolution by tier weight, over unknowns only", () => {
    expect(r.resolutionCost).toBe(TIER_WEIGHT[0] + TIER_WEIGHT[3]);
  });

  it("values each unknown as pFavorable over its tier weight, and ignores settled cells", () => {
    expect(r.expectedValue).toBeCloseTo(0.3 / TIER_WEIGHT[0] + 0.6 / TIER_WEIGHT[3], 10);
  });

  it("treats an unknown with no prevalence prior as worth nothing yet, not as an error", () => {
    const noPrior = evaluate(patient(), trial({ criteria: [leaf({ id: "X", analyte: "ANC", tier: 2 })] }), ASOF);
    expect(noPrior.expectedValue).toBe(0);
    expect(noPrior.resolutionCost).toBe(TIER_WEIGHT[2]);
  });
});

/* ------------------------------------------------------------------- purity */

describe("purity", () => {
  const p = patient({ age: 64, facts: [fact({ analyte: "ANC", value: 1200, unit: "/uL", observedAt: "2026-09-20" })] });
  const t = trial({
    criteria: [
      leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 }),
      leaf({ id: "INC-1", analyte: "ANC", operator: ">=", value: 1500, unit: "/uL", maxAgeDays: 14 }),
    ],
  });

  it("returns identical results for identical inputs", () => {
    expect(evaluate(p, t, ASOF)).toEqual(evaluate(p, t, ASOF));
  });

  it("does not mutate the patient or the trial", () => {
    const pSnapshot = JSON.stringify(p);
    const tSnapshot = JSON.stringify(t);
    evaluate(p, t, ASOF);
    expect(JSON.stringify(p)).toBe(pSnapshot);
    expect(JSON.stringify(t)).toBe(tSnapshot);
  });

  it("changes its answer only because asOf changed", () => {
    expect(cellOf(evaluate(p, t, "2026-09-25"), "INC-1").reason).toBe("contradicted");
    expect(cellOf(evaluate(p, t, "2027-09-25"), "INC-1").reason).toBe("stale");
  });

  it("imports nothing from fs, node-fetch or a database client", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await Promise.all(
      ["evaluate.ts", "kleene.ts", "time.ts"].map((f) =>
        readFile(new URL(f, import.meta.url), "utf8"),
      ),
    );
    for (const text of src.join("\n").split("\n")) {
      expect(text).not.toMatch(/from\s+["'](node:)?(fs|http|https|net|child_process)/);
      expect(text).not.toMatch(/node-fetch|pg|mysql|mongodb|prisma|drizzle/);
    }
  });

  it("never reads the clock", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const f of ["evaluate.ts", "kleene.ts", "time.ts"]) {
      const text = await readFile(new URL(f, import.meta.url), "utf8");
      // Comments mention Date.now deliberately; strip them before asserting.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/Date\.now|new Date\(\s*\)|performance\.now/);
    }
  });

  it("rejects an unusable asOf loudly instead of emitting a cube of UNKNOWNs", () => {
    expect(() => evaluate(p, t, "last Tuesday")).toThrow(TypeError);
    expect(() => evaluate(p, t, "2026-02-31")).toThrow(/asOf/);
  });
});

/* ------------------------------------------------------------- short-circuit */

describe("short-circuit", () => {
  const under18 = leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 });
  const later = leaf({ id: "INC-1", analyte: "ANC", operator: ">=", value: 1500 });
  const t = trial({ criteria: [under18, later] });
  const kid = patient({ age: 12 });

  it("stops at the first eliminating criterion when asked", () => {
    const r = evaluate(kid, t, ASOF, { shortCircuit: true });
    expect(r.eliminated).toBe(true);
    expect(r.cells.map((c) => c.criterionId)).toEqual(["INC-0"]);
  });

  it("defaults to the full cube, because what else is missing is the product", () => {
    const r = evaluate(kid, t, ASOF);
    expect(r.eliminated).toBe(true);
    expect(r.cells).toHaveLength(2);
  });

  it("agrees on the eliminated flag either way", () => {
    expect(evaluate(kid, t, ASOF, { shortCircuit: true }).eliminated).toBe(
      evaluate(kid, t, ASOF).eliminated,
    );
  });
});

/* -------------------------------------------------------------------- helpers */

describe("helpers", () => {
  it("indexLeaves finds leaves at every depth", () => {
    const t = trial({
      criteria: [leaf({ id: "A" }), group("AND", [leaf({ id: "B" }), group("OR", [leaf({ id: "C" })])])],
    });
    expect([...indexLeaves(t).keys()]).toEqual(["A", "B", "C"]);
  });

  it("eligibilityVerdict flips exclusions and leaves UNKNOWN alone", () => {
    expect(eligibilityVerdict("PASS", "exclusion")).toBe("FAIL");
    expect(eligibilityVerdict("FAIL", "exclusion")).toBe("PASS");
    expect(eligibilityVerdict("UNKNOWN", "exclusion")).toBe("UNKNOWN");
    expect(eligibilityVerdict("PASS", "inclusion")).toBe("PASS");
    expect(eligibilityVerdict("UNKNOWN", "inclusion")).toBe("UNKNOWN");
  });

  it("isEliminating reads a mixed group as an inclusion", () => {
    expect(isEliminating("FAIL", "mixed")).toBe(true);
    expect(isEliminating("PASS", "mixed")).toBe(false);
    expect(isEliminating("UNKNOWN", "mixed")).toBe(false);
  });

  it("evaluateAll walks the cohort patient-major in input order", () => {
    const ps = [patient({ id: "PT-1" }), patient({ id: "PT-2" })];
    const ts = [trial({ nctId: "NCT00000001" }), trial({ nctId: "NCT00000002" })];
    expect(evaluateAll(ps, ts, ASOF).map((r) => `${r.patientId}/${r.nctId}`)).toEqual([
      "PT-1/NCT00000001",
      "PT-1/NCT00000002",
      "PT-2/NCT00000001",
      "PT-2/NCT00000002",
    ]);
  });
});

/* --------------------------------------------------------------- citations */

describe("every cell carries its citations", () => {
  it("always has the trial's own words", () => {
    const t = trial({
      criteria: [
        leaf({ id: "A", sourceSpan: "Age >= 18 years", predicate: "age", operator: ">=", value: 18 }),
        leaf({ id: "B", sourceSpan: "ANC >= 1500/uL", analyte: "ANC", operator: ">=", value: 1500 }),
      ],
    });
    const r = evaluate(patient(), t, ASOF);
    expect(r.cells).toHaveLength(2);
    for (const c of r.cells) expect(c.criterionCitation.length).toBeGreaterThan(0);
  });

  it("has the record's words whenever a fact carried the verdict", () => {
    const t = trial({ criteria: [leaf({ id: "B", analyte: "ANC", operator: ">=", value: 1500 })] });
    const p = patient({ facts: [fact({ analyte: "ANC", value: 2000, sourceQuote: "ANC 2.0 K/uL" })] });
    expect(cellOf(evaluate(p, t, ASOF), "B").chartCitation).toBe("ANC 2.0 K/uL");
  });

  it("builds fixtures the frozen schemas accept", () => {
    const t = trial({ criteria: [leaf({ id: "A" }), group("OR", [leaf({ id: "B" })])] });
    expect(() => assertValid(t, [patient()])).not.toThrow();
  });

  it("exposes leaf-level detail for a single criterion without a whole trial", () => {
    const out = evaluateLeaf(
      leaf({ id: "A", analyte: "ANC", operator: ">=", value: 1500, maxAgeDays: 14 }),
      patient({ facts: [fact({ analyte: "ANC", value: 2000, observedAt: "2026-09-24" })] }),
      ASOF,
    );
    expect(out).toMatchObject({ verdict: "PASS", reason: "satisfied", ageDays: 1 });
  });
});
