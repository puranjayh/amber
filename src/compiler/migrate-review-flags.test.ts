import { expect, test } from "vitest";
import { migrateReviewFlags } from "@/src/compiler/migrate-review-flags";
import type { CompiledTrialResult } from "@/src/compiler/compile";

const citationOnly: CompiledTrialResult = {
  sourceText: "Age 18 years or older.",
  trial: { nctId: "NCT00000001", title: "One", phase: "PHASE1", condition: "Lung cancer", slots: 0, criteria: [], compilerConfidence: 1, needsHumanReview: true },
  reviewReasons: ["INC-1 sourceSpan near-verbatim", "INC-2 sourceSpan not verifiable; full source block retained"],
};

test("moves citation-only flags out of the semantic review gate", () => {
  expect(migrateReviewFlags(citationOnly)).toMatchObject({
    trial: { needsHumanReview: false },
    citationFlags: citationOnly.reviewReasons,
  });
  expect(migrateReviewFlags(citationOnly)).not.toHaveProperty("reviewReasons");
});

test("retains a usable-tree backtranslation failure as a semantic review reason", () => {
  const result: CompiledTrialResult = {
    ...citationOnly,
    trial: { ...citationOnly.trial, criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 1, sweepable: true, sweepRange: [0, 100], sweepStep: 1, sourceSpan: "Age 18 years or older." }] },
    failure: { nctId: "NCT00000001", issues: ["INC-1: polarity divergence"] },
  };
  expect(migrateReviewFlags(result)).toMatchObject({
    trial: { needsHumanReview: true },
    reviewReasons: ["INC-1: polarity divergence"],
  });
});
