import { expect, test } from "vitest";
import { mergeRetryResults } from "@/src/compiler/refresh-artifacts";
import type { CompiledTrialResult } from "@/src/compiler/compile";

const result = (nctId: string, sourceText: string): CompiledTrialResult => ({
  sourceText,
  trial: { nctId, title: nctId, phase: "PHASE1", condition: "Lung cancer", slots: 0, criteria: [], compilerConfidence: 0, needsHumanReview: true },
  failure: { nctId, issues: [sourceText] },
});

test("replaces only requested retry trials while preserving corpus order", () => {
  expect(mergeRetryResults([result("NCT00000001", "old"), result("NCT00000002", "unchanged")], [result("NCT00000001", "retry")]).map((item) => item.sourceText))
    .toEqual(["retry", "unchanged"]);
});

test("refuses a retry that is not part of the base corpus", () => {
  expect(() => mergeRetryResults([result("NCT00000001", "old")], [result("NCT00000002", "retry")]))
    .toThrow(/absent/);
});
