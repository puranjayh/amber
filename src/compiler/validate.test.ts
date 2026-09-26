import assert from "node:assert/strict";
import test from "node:test";
import { buildThresholdHistogram, validateCompilationResults } from "@/src/compiler/validate";
import type { CompiledTrialResult } from "@/src/compiler/compile";

const accepted: CompiledTrialResult = {
  sourceText: "ANC >= 1500 /uL.",
  trial: {
    nctId: "NCT00000001", title: "One", phase: "PHASE1", condition: "Lung cancer", slots: 0, compilerConfidence: 1, needsHumanReview: false,
    criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500, unit: "/uL", tier: 1, sweepable: true, sweepRange: [0, 3000], sweepStep: 100, sourceSpan: "ANC >= 1500 /uL." }],
  },
};

test("reports numeric thresholds by analyte and excludes review-only trials", () => {
  const flagged: CompiledTrialResult = { ...accepted, trial: { ...accepted.trial, nctId: "NCT00000002", needsHumanReview: true } };
  assert.deepEqual(buildThresholdHistogram([accepted, flagged]), { ANC: [{ threshold: 1500, count: 1 }] });
  assert.deepEqual(validateCompilationResults([accepted, flagged]), {
    total: 2, compiled: 2, rejected: 0, flagged: 1, invalidOutput: 0,
    thresholdHistogram: { ANC: [{ threshold: 1500, count: 1 }] },
  });
});
