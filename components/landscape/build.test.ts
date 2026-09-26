import { expect, test } from "vitest";
import type { CriterionLeaf, Trial } from "@/src/contracts";
import { buildLandscape, thresholdHeadline } from "./build";

const leaf = (over: Partial<CriterionLeaf> & Pick<CriterionLeaf, "id" | "value" | "analyte">): CriterionLeaf => ({
  kind: "leaf",
  type: "inclusion",
  predicate: "lab_value",
  operator: ">=",
  tier: 1,
  sourceSpan: "protocol",
  ...over,
});

const trial = (nctId: string, criteria: CriterionLeaf[], review = false): Trial => ({
  nctId,
  title: nctId,
  phase: "PHASE2",
  condition: "NSCLC",
  slots: 1,
  criteria,
  compilerConfidence: 1,
  needsHumanReview: review,
});

test("sorts analytes by how many trials use them, and de-duplicates a repeated leaf", () => {
  const landscape = buildLandscape([
    trial("NCT00000001", [leaf({ id: "A", analyte: "ANC", value: 1500 }), leaf({ id: "A2", analyte: "ANC", value: 1500 })]),
    trial("NCT00000002", [leaf({ id: "A", analyte: "ANC", value: 1000 }), leaf({ id: "H", analyte: "hemoglobin", value: 9 })]),
    trial("NCT00000003", [leaf({ id: "A", analyte: "ANC", value: 1500 })]),
  ]);
  expect(landscape.generatedFromTrials).toBe(3);
  expect(landscape.analytes.map((a) => a.analyte)).toEqual(["ANC", "hemoglobin"]);
  const anc = landscape.analytes[0];
  expect(anc.totalTrials).toBe(3);
  expect(anc.operators[0].thresholds).toEqual([
    { threshold: 1000, count: 1, percentage: 1 / 3 },
    { threshold: 1500, count: 2, percentage: 2 / 3 },
  ]);
});

test("headline names the split and withholds consensus below 80%", () => {
  expect(
    thresholdHeadline([
      { threshold: 1500, count: 68, percentage: 0.68 },
      { threshold: 1000, count: 22, percentage: 0.22 },
    ]),
  ).toBe("68% use 1500, 22% use 1000 · no consensus");
  expect(thresholdHeadline([{ threshold: 1500, count: 3, percentage: 1 }])).toBe("100% use 1500 · consensus");
  expect(
    thresholdHeadline([
      { threshold: 18, count: 154, percentage: 0.828 },
      { threshold: 50, count: 8, percentage: 0.043 },
    ]),
  ).toBe("83% use 18, 4% use 50 · consensus");
});
