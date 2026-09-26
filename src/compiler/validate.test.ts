import { expect, test } from "vitest";
import { buildCompilationCoverage, buildCriteriaLandscape, buildSemanticReviewQueue, buildThresholdHistogram, classifyReviewFlag, summarizeReviewFlags, validateCompilationResults } from "@/src/compiler/validate";
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
    reviewFlags: {
      citationGranularity: { trials: 0, flags: 0, reasons: {} },
      semantic: { trials: 0, flags: 0, reasons: {} },
    },
  });
});

test("separates citation granularity from semantic review risk and queues only semantics", () => {
  const citation = {
    ...accepted,
    trial: { ...accepted.trial, nctId: "NCT00000002", needsHumanReview: true },
    reviewReasons: ["INC-1 sourceSpan near-verbatim", "INC-2 sourceSpan not verifiable; full source block retained"],
  } satisfies CompiledTrialResult;
  const semantic = {
    ...accepted,
    trial: { ...accepted.trial, nctId: "NCT00000003", title: "Semantic review", needsHumanReview: true },
    reviewReasons: ["possible structural alternative has no OR group"],
  } satisfies CompiledTrialResult;

  expect(classifyReviewFlag("INC-1 sourceSpan near-verbatim")).toBe("citation_granularity");
  expect(classifyReviewFlag("INC-1 sourceSpan not verifiable; full source block retained")).toBe("citation_granularity");
  expect(classifyReviewFlag("possible structural alternative has no OR group")).toBe("semantic");
  expect(summarizeReviewFlags([citation, semantic])).toEqual({
    citationGranularity: {
      trials: 1,
      flags: 2,
      reasons: {
        "INC-1 sourceSpan near-verbatim": 1,
        "INC-2 sourceSpan not verifiable; full source block retained": 1,
      },
    },
    semantic: {
      trials: 1,
      flags: 1,
      reasons: { "possible structural alternative has no OR group": 1 },
    },
  });
  expect(buildSemanticReviewQueue([citation, semantic])).toEqual({
    generatedFromTrials: 2,
    reviews: [{
      nctId: "NCT00000003",
      title: "Semantic review",
      semanticReasons: ["possible structural alternative has no OR group"],
      sourceText: "ANC >= 1500 /uL.",
      compiledTree: accepted.trial.criteria,
    }],
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

test("exports one corpus coverage denominator for the app", () => {
  const rejected: CompiledTrialResult = {
    sourceText: "Unable to compile.",
    trial: { ...accepted.trial, nctId: "NCT00000002", criteria: [], compilerConfidence: 0, needsHumanReview: true },
    failure: { nctId: "NCT00000002", issues: ["schema rejected"] },
  };
  const semantic = { ...accepted, trial: { ...accepted.trial, nctId: "NCT00000003", needsHumanReview: true }, reviewReasons: ["depth-limit flag"] } satisfies CompiledTrialResult;
  expect(buildCompilationCoverage([accepted, rejected, semantic])).toEqual({
    generatedFromTrials: 3,
    compiledTrials: 2,
    rejectedTrials: 1,
    flaggedTrials: 2,
    demoPoolTrials: 1,
    semanticReviewTrials: 1,
    citationGranularityReviewTrials: 0,
  });
});
