import { expect, test } from "vitest";
import { deduplicateTrialCriterionIds } from "@/src/compiler/dedupe-criterion-ids";
import type { CompiledTrialResult } from "@/src/compiler/compile";

const duplicateCohorts: CompiledTrialResult = {
  sourceText: "Two cohorts.",
  trial: {
    nctId: "NCT00000001", title: "Two cohorts", phase: "PHASE1", condition: "Lung cancer", slots: 0, compilerConfidence: 1, needsHumanReview: false,
    criteria: [
      { kind: "group", op: "AND", children: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 50, tier: 1, sweepable: true, sweepRange: [0, 120], sweepStep: 1, sourceSpan: "Cohort 1 age." }] },
      { kind: "group", op: "AND", children: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 55, tier: 1, sweepable: true, sweepRange: [0, 120], sweepStep: 1, sourceSpan: "Cohort 2 age." }] },
    ],
  },
  citationFlags: ["INC-1 sourceSpan near-verbatim"],
};

test("suffixes repeated cohort ids in source order without altering the tree", () => {
  const repaired = deduplicateTrialCriterionIds(duplicateCohorts);
  const ids = repaired.trial.criteria.flatMap((node) => node.kind === "group" ? node.children.map((child) => child.kind === "leaf" ? child.id : "group") : [node.id]);
  expect(ids).toEqual(["INC-1", "INC-1-2"]);
});
