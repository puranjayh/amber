import { expect, test } from "vitest";
import { backtranslateTrial, diffSourceSpan } from "@/src/compiler/backtranslate";
import type { CompiledTrialResult } from "@/src/compiler/compile";
import type { CriterionLeaf } from "@/src/contracts";

const leaf: CriterionLeaf = {
  kind: "leaf", id: "EXC-1", type: "exclusion", predicate: "prior_therapy", operator: "in",
  value: ["osimertinib"], tier: 1, sweepable: false, sourceSpan: "No prior osimertinib treatment.",
};

test("flags a backtranslation that flips an exclusion's polarity", () => {
  const issues = diffSourceSpan(leaf, { id: "EXC-1", type: "exclusion", text: "Prior osimertinib treatment is required." });
  expect(issues.join("\n")).toMatch(/polarity divergence/);
});

test("marks a trial for review when backtranslation diverges", async () => {
  const result: CompiledTrialResult = {
    trial: { nctId: "NCT00000001", title: "Example", phase: "PHASE1", condition: "Lung cancer", slots: 0, criteria: [leaf], compilerConfidence: 1, needsHumanReview: false },
    sourceText: leaf.sourceSpan,
  };
  const checked = await backtranslateTrial(result, async () => [{ id: "EXC-1", type: "exclusion", text: "Prior osimertinib treatment is required." }]);
  expect(checked.trial.needsHumanReview).toBe(true);
  expect(checked.failure!.issues.join("\n")).toMatch(/polarity divergence/);
});
