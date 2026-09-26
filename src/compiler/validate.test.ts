import { expect, test } from "vitest";
import { buildCriteriaLandscape, buildThresholdHistogram, validateCompilationResults } from "@/src/compiler/validate";
import type { CompiledTrialResult } from "@/src/compiler/compile";
import type { CriterionLeaf } from "@/src/contracts";

const accepted: CompiledTrialResult = {
  sourceText: "ANC >= 1500 /uL.",
  trial: {
    nctId: "NCT00000001", title: "One", phase: "PHASE1", condition: "Lung cancer", slots: 0, compilerConfidence: 1, needsHumanReview: false,
    criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500, unit: "/uL", tier: 1, sweepable: true, sweepRange: [0, 3000], sweepStep: 100, sourceSpan: "ANC >= 1500 /uL." }],
  },
};

test("reports numeric thresholds by analyte and excludes review-only trials", () => {
  const flagged: CompiledTrialResult = { ...accepted, trial: { ...accepted.trial, nctId: "NCT00000002", needsHumanReview: true } };
  expect(buildThresholdHistogram([accepted, flagged])).toEqual({ ANC: [{ threshold: 1500, count: 1 }] });
  expect(validateCompilationResults([accepted, flagged])).toEqual({
    total: 2, compiled: 2, rejected: 0, flagged: 1, invalidOutput: 0,
    thresholdHistogram: { ANC: [{ threshold: 1500, count: 1 }] },
  });
});

test("exports a trial-deduplicated landscape with flagged context and percentages", () => {
  const ancLeaf = accepted.trial.criteria[0] as CriterionLeaf;
  const sameTrialDifferentLeaf: CompiledTrialResult = {
    ...accepted,
    trial: {
      ...accepted.trial,
      criteria: [
        ancLeaf,
        { ...ancLeaf, id: "INC-2", value: 1000 },
      ],
    },
  };
  const flagged: CompiledTrialResult = {
    ...accepted,
    trial: { ...accepted.trial, nctId: "NCT00000002", needsHumanReview: true },
  };
  expect(buildCriteriaLandscape([sameTrialDifferentLeaf, flagged])).toEqual({
    generatedFromTrials: 2,
    analytes: [{
      analyte: "ANC",
      totalTrials: 2,
      flaggedTrials: 1,
      operators: [{
        operator: ">=",
        totalTrials: 2,
        flaggedTrials: 1,
        thresholds: [
          { threshold: 1000, count: 1, percentage: 0.5 },
          { threshold: 1500, count: 2, percentage: 1 },
        ],
      }],
    }],
  });
});
