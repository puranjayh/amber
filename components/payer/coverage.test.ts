import { expect, test } from "vitest";
import type { CriterionLeaf, Trial } from "@/src/contracts";
import { buildClaimsCoverage, kindOf, pct1 } from "./coverage";

const leaf = (over: Partial<CriterionLeaf> & Pick<CriterionLeaf, "id" | "predicate" | "type">): CriterionLeaf => ({
  kind: "leaf",
  operator: ">=",
  value: 1,
  tier: 0,
  sourceSpan: over.id,
  ...over,
});

const trial = (id: string, criteria: CriterionLeaf[]): Trial => ({
  nctId: id,
  title: id,
  phase: "PHASE3",
  slots: 1,
  condition: "NSCLC",
  criteria,
  compilerConfidence: 1,
  needsHumanReview: true,
});

test("washout and contraindication are the ambiguous set", () => {
  expect(kindOf("prior_therapy")).toBe("certain");
  expect(kindOf("washout")).toBe("ambiguous");
  expect(kindOf("lab_value")).toBe("never");
});

test("conservative headline treats ambiguous as chart-needed", () => {
  const coverage = buildClaimsCoverage(
    [
      trial("NCT1", [
        leaf({ id: "EXC-1", type: "exclusion", predicate: "prior_therapy" }),
        leaf({ id: "EXC-2", type: "exclusion", predicate: "washout" }),
        leaf({ id: "INC-1", type: "inclusion", predicate: "lab_value" }),
        leaf({ id: "INC-2", type: "inclusion", predicate: "diagnosis" }),
      ]),
    ],
    "test",
  );
  expect(coverage.trials).toBe(1);
  expect(coverage.criteria).toBe(4);
  expect(coverage.answerable).toBe(2);
  expect(coverage.ambiguous).toBe(1);
  expect(coverage.lowerRate).toBe(0.5);
  expect(coverage.upperRate).toBe(0.75);
  expect(coverage.exclusions.rate).toBe(0.5);
  expect(pct1(coverage.lowerRate)).toBe("50.0%");
});

test("empty trees do not count", () => {
  const coverage = buildClaimsCoverage([trial("NCT0", [])], "test");
  expect(coverage.trials).toBe(0);
  expect(coverage.criteria).toBe(0);
});
