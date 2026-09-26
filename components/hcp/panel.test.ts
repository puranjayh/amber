import { expect, test } from "vitest";
import { compositionHeadline, raceLabel } from "./race";
import { blockingHitsGroup, takePanel } from "./panel";
import { draftOutreach } from "./outreach";

test("raceLabel collapses Synthea and fixture spellings", () => {
  expect(raceLabel("white")).toBe("White");
  expect(raceLabel("White")).toBe("White");
  expect(raceLabel("Black or African American")).toBe("Black");
  expect(raceLabel("black")).toBe("Black");
});

test("takePanel is the first 25 of rank() order", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    patientId: `P-${i}`,
    nctId: "NCT07001001",
    eliminated: false,
    passCount: 0,
    failCount: 0,
    unknownCount: i,
    blocking: [],
    resolutionTier: null,
    resolutionCost: 0,
    expectedValue: 0,
  }));
  expect(takePanel(rows).map((r) => r.patientId)).toEqual(rows.slice(0, 25).map((r) => r.patientId));
});

test("compositionHeadline leads with the group left out", () => {
  const line = compositionHeadline({ Black: 0.22, White: 0.78 }, { Black: 0.09, White: 0.91 });
  expect(line.group).toBe("Black");
  expect(line.text).toBe(
    "Black patients are 22% of your panel and 9% of the patients these criteria admit.",
  );
});

test("a group admitted at 0% leads over a larger over-representation", () => {
  const line = compositionHeadline(
    { Asian: 0.76, Black: 0.04, White: 0.2 },
    { Asian: 0.87, Black: 0, White: 0.13 },
  );
  expect(line.group).toBe("Black");
  expect(line.text).toBe(
    "Black patients are 4% of your panel and 0% of the patients these criteria admit.",
  );
});

test("blockingHitsGroup fires only when this group is strictly worst", () => {
  const row = {
    criterionId: "INC-3",
    label: "EGFR",
    exclusionRateBySubgroup: { black: 0.4, white: 0.1, asian: 0.1 },
    maxGapPoints: 30,
  };
  expect(blockingHitsGroup(row, "Black or African American")?.rate).toBe(0.4);
  expect(blockingHitsGroup(row, "white")).toBeUndefined();
});

test("draftOutreach names the trial, the unknown, and the order", () => {
  const draft = draftOutreach({
    patientId: "PT-4401",
    trial: {
      nctId: "NCT07001001",
      title: "DEMO-FL",
      phase: "PHASE3",
      condition: "NSCLC",
      slots: 1,
      criteria: [],
      compilerConfidence: 1,
      needsHumanReview: false,
    },
    cell: {
      patientId: "PT-4401",
      nctId: "NCT07001001",
      criterionId: "INC-3",
      verdict: "UNKNOWN",
      reason: "absent",
      criterionCitation: "Documented EGFR mutation.",
      tier: 0,
    },
    leaf: {
      kind: "leaf",
      id: "INC-3",
      type: "inclusion",
      predicate: "biomarker",
      operator: "==",
      value: "EGFR",
      analyte: "EGFR",
      tier: 0,
      sourceSpan: "Documented EGFR mutation.",
      sweepable: false,
    },
    order: { title: "EGFR mutation testing on archived tissue", detail: "Reflex NGS." },
  });
  expect(draft.subject).toContain("NCT07001001");
  expect(draft.body).toContain("DEMO-FL");
  expect(draft.body).toContain("Documented EGFR mutation.");
  expect(draft.body).toContain("EGFR mutation testing");
  expect(draft.body).toContain("Draft only");
});
