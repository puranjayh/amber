import { expect, test } from "vitest";
import { compileTrial, extractEligibilityBlocks } from "@/src/compiler/compile";
import type { RawClinicalTrial } from "@/src/compiler/fetch-trials";

const raw: RawClinicalTrial = {
  protocolSection: {
    identificationModule: { nctId: "NCT00000001", briefTitle: "Example trial" },
    designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE3"] },
    conditionsModule: { conditions: ["Non-small cell lung cancer"] },
    eligibilityModule: { eligibilityCriteria: "Inclusion Criteria:\n- Age 18 years or older.\n- ANC >= 1500 /uL.\n\nExclusion Criteria:\n- Prior osimertinib or gefitinib." },
  },
};

test("splits source eligibility headings without changing their words", () => {
  expect(extractEligibilityBlocks(raw.protocolSection.eligibilityModule!.eligibilityCriteria!)).toEqual([
    { type: "inclusion", sourceText: "- Age 18 years or older.\n- ANC >= 1500 /uL." },
    { type: "exclusion", sourceText: "- Prior osimertinib or gefitinib." },
  ]);
});

test("rejects a numeric tree that omits elasticity metadata", async () => {
  const result = await compileTrial(raw, async (block) => ({
    kind: "leaf",
    id: block.type === "inclusion" ? "INC-1" : "EXC-1",
    type: block.type === "unknown" ? "inclusion" : block.type,
    predicate: "age",
    operator: ">=",
    value: 18,
    tier: 1,
    sweepable: false,
    sourceSpan: block.sourceText,
  }));
  expect(result.trial.needsHumanReview).toBe(true);
  expect(result.trial.criteria).toHaveLength(0);
  expect(result.failure!.issues.join("\n")).toMatch(/numeric leaf is missing sweep metadata/);
});

test("keeps a nested OR as a group node", async () => {
  const alternative: RawClinicalTrial = {
    ...raw,
    protocolSection: {
      ...raw.protocolSection,
      eligibilityModule: { eligibilityCriteria: "Inclusion Criteria:\n- ALK-positive or ROS1-positive disease." },
    },
  };
  const result = await compileTrial(alternative, async () => ({
    kind: "group",
    op: "OR",
    children: [
      { kind: "leaf", id: "INC-1", type: "inclusion", predicate: "biomarker", operator: "==", value: "ALK-positive", tier: 0, sweepable: false, sourceSpan: "ALK-positive" },
      { kind: "leaf", id: "INC-2", type: "inclusion", predicate: "biomarker", operator: "==", value: "ROS1-positive", tier: 0, sweepable: false, sourceSpan: "ROS1-positive" },
    ],
  }));
  expect(result.trial.needsHumanReview).toBe(false);
  expect(result.trial.criteria[0].kind).toBe("group");
  expect((result.trial.criteria[0] as { op: string }).op).toBe("OR");
});
