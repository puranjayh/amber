import { expect, test } from "vitest";
import {
  boundedResponseJsonSchema,
  compileTrial,
  extractEligibilityBlocks,
  fidelityDefectCounts,
  fidelityDefects,
  MAX_GROUP_DEPTH,
  nearVerbatimSimilarity,
  normalizeSweepMetadata,
  normalizeSourceText,
  selectRawTrialsByNctIds,
  validateCompiledTree,
} from "@/src/compiler/compile";
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

test("keeps a numeric leaf when it is explicitly not sweepable", async () => {
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
  expect(result.trial.needsHumanReview).toBe(false);
  expect(result.trial.criteria).toHaveLength(2);
  expect(result.failure).toBeUndefined();
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

test("rejects a drug class represented as a bare boolean equality", async () => {
  const therapy: RawClinicalTrial = {
    ...raw,
    protocolSection: {
      ...raw.protocolSection,
      eligibilityModule: { eligibilityCriteria: "Inclusion Criteria:\n- Prior treatment with an EGFR TKI." },
    },
  };
  const result = await compileTrial(therapy, async () => ({
    kind: "leaf",
    id: "INC-1",
    type: "inclusion",
    predicate: "prior_therapy",
    operator: "==",
    value: true,
    drugClass: "EGFR_TKI",
    tier: 1,
    sweepable: false,
    sourceSpan: "Prior treatment with an EGFR TKI.",
  }));
  expect(result.trial.needsHumanReview).toBe(true);
  expect(result.failure!.issues.join("\n")).toMatch(/must use the in operator/);
  expect(result.failure!.issues.join("\n")).toMatch(/require resolved members/);
});

test("rejects a target-less washout rather than applying it to every therapy", () => {
  const source = "Prior palliative or curative radiotherapy must be completed at least 14 days prior.";
  const checked = validateCompiledTree({
    kind: "leaf", id: "EXC-1", type: "exclusion", predicate: "washout", operator: ">=", value: 14,
    unit: "days", tier: 4, sweepable: true, sweepRange: [0, 90], sweepStep: 1, sourceSpan: source,
  }, { type: "exclusion", sourceText: source });
  expect(checked.success).toBe(false);
  if (!checked.success) expect(checked.issues.join("\n")).toMatch(/no target exposure/);
});

test("accepts a washout only when it identifies what the clock is from", () => {
  const source = "Prior palliative or curative radiotherapy must be completed at least 14 days prior.";
  const checked = validateCompiledTree({
    kind: "leaf", id: "EXC-1", type: "exclusion", predicate: "washout", operator: ">=", value: 14,
    unit: "days", drugClass: "RADIOTHERAPY", tier: 4, sweepable: true, sweepRange: [0, 90], sweepStep: 1, sourceSpan: source,
  }, { type: "exclusion", sourceText: source });
  expect(checked.success).toBe(true);
});

test("rejects an enumerated organ-function clause collapsed into a boolean leaf", () => {
  const source = "Adequate organ function: ANC >= 1500/uL, platelets >= 100,000/uL, CrCl >= 45 mL/min.";
  const checked = validateCompiledTree({
    kind: "leaf", id: "INC-1", type: "inclusion", predicate: "lab_value", operator: "==", value: true,
    tier: 1, sweepable: false, sourceSpan: source,
  }, { type: "inclusion", sourceText: source });
  expect(checked.success).toBe(false);
  if (!checked.success) {
    expect(checked.issues.join("\n")).toMatch(/lab_value requires a numeric value and a named analyte/);
    expect(checked.issues.join("\n")).toMatch(/boolean leaf has no named subject/);
    expect(checked.issues.join("\n")).toMatch(/multiple threshold requirements/);
  }
});

test("rejects an unnamed boolean clause instead of emitting a catch-all fact", () => {
  const source = "Women who are pregnant or lactating.";
  const checked = validateCompiledTree({
    kind: "leaf", id: "EXC-2", type: "exclusion", predicate: "comorbidity", operator: "==", value: true,
    tier: 1, sweepable: false, sourceSpan: source,
  }, { type: "exclusion", sourceText: source });
  expect(checked.success).toBe(false);
  if (!checked.success) expect(checked.issues.join("\n")).toMatch(/boolean leaf has no named subject/);
});

test("names the three fidelity defect classes for the smoke-publication gate", () => {
  const booleanLeaf = {
    kind: "leaf" as const, id: "EXC-1", type: "exclusion" as const, predicate: "comorbidity" as const,
    operator: "==" as const, value: true, tier: 1 as const, sweepable: false, sourceSpan: "Pregnant or lactating.",
  };
  const missingWashoutTarget = {
    kind: "leaf" as const, id: "EXC-2", type: "exclusion" as const, predicate: "washout" as const,
    operator: ">=" as const, value: 14, tier: 4 as const, sweepable: true, sweepRange: [0, 90] as [number, number], sweepStep: 1, sourceSpan: "Radiotherapy 14 days prior.",
  };
  const quotedWashout = {
    kind: "leaf" as const, id: "EXC-3", type: "exclusion" as const, predicate: "washout" as const,
    operator: "==" as const, value: "Chest CT scan or chest PET/CT within 12 months.", drugClass: "RADIOTHERAPY", tier: 4 as const, sweepable: false, sourceSpan: "Chest CT scan or chest PET/CT within 12 months.",
  };
  expect(fidelityDefects(booleanLeaf)).toEqual(["sentence-as-boolean"]);
  expect(fidelityDefects(missingWashoutTarget)).toEqual(["washout-without-target"]);
  expect(fidelityDefects(quotedWashout)).toEqual(["quoted-sentence-in-value"]);
  expect(fidelityDefectCounts([{ trial: { ...raw.protocolSection.identificationModule, nctId: "NCT00000001", title: "x", phase: "x", slots: 0, condition: "x", criteria: [booleanLeaf, missingWashoutTarget, quotedWashout], compilerConfidence: 1, needsHumanReview: false }, sourceText: "x" }])).toEqual({
    "sentence-as-boolean": 1,
    "washout-without-target": 1,
    "quoted-sentence-in-value": 1,
  });
});

test("accepts an AND group of typed leaves for an enumerated organ-function clause", () => {
  const source = "Adequate organ function: ANC >= 1500/uL, platelets >= 100,000/uL, CrCl >= 45 mL/min.";
  const leaf = (id: string, analyte: string, value: number, unit: string, sourceSpan: string) => ({
    kind: "leaf" as const, id, type: "inclusion" as const, predicate: "lab_value" as const,
    analyte, operator: ">=" as const, value, unit, tier: 1 as const, sweepable: true,
    sweepRange: [0, value * 2] as [number, number], sweepStep: value >= 1000 ? 100 : 5, sourceSpan,
  });
  const checked = validateCompiledTree({
    kind: "group",
    op: "AND",
    children: [
      leaf("INC-1", "ANC", 1500, "/uL", "ANC >= 1500/uL"),
      leaf("INC-2", "platelets", 100000, "/uL", "platelets >= 100,000/uL"),
      leaf("INC-3", "CrCl", 45, "mL/min", "CrCl >= 45 mL/min"),
    ],
  }, { type: "inclusion", sourceText: source });
  expect(checked.success).toBe(true);
});

test("inlines bounded group nesting without recursive schema references", () => {
  expect(JSON.stringify(boundedResponseJsonSchema)).not.toContain("$ref");
  expect(MAX_GROUP_DEPTH).toBe(3);
});

test("flags a tree that needs more than the bounded nesting depth", () => {
  const leaf = {
    kind: "leaf" as const,
    id: "INC-1",
    type: "inclusion" as const,
    predicate: "biomarker" as const,
    operator: "==" as const,
    value: "positive",
    tier: 0 as const,
    sweepable: false,
    sourceSpan: "Biomarker positive.",
  };
  const nested = (levels: number): unknown => levels === 0
    ? leaf
    : { kind: "group", op: "AND", children: [nested(levels - 1)] };
  const block = { type: "inclusion" as const, sourceText: "Biomarker positive." };
  expect(validateCompiledTree(nested(MAX_GROUP_DEPTH), block).success).toBe(true);
  const tooDeep = validateCompiledTree(nested(MAX_GROUP_DEPTH + 1), block);
  expect(tooDeep.success).toBe(true);
  if (tooDeep.success) expect(tooDeep.reviewReasons.join("\n")).toMatch(/exceeds the supported nesting depth/);
});

test("drops invalid sweep metadata without changing the clinical leaf", () => {
  const normalized = normalizeSweepMetadata({
    kind: "leaf",
    id: "INC-1",
    type: "inclusion",
    predicate: "performance_status",
    operator: "<=",
    value: 1,
    tier: 1,
    sweepable: true,
    sweepRange: [1, 1],
    sweepStep: 0,
    sourceSpan: "ECOG 0 or 1.",
  }) as Record<string, unknown>;
  expect(normalized).toMatchObject({ sweepable: false, value: 1, sourceSpan: "ECOG 0 or 1." });
  expect(normalized).not.toHaveProperty("sweepRange");
  expect(normalized).not.toHaveProperty("sweepStep");
});

test("drops sweep metadata from non-numeric leaves without changing their clinical meaning", () => {
  const normalized = normalizeSweepMetadata({
    kind: "leaf", id: "EXC-1", value: "pembrolizumab", sweepable: true, sweepRange: [0, 1], sweepStep: 1,
  }) as Record<string, unknown>;
  expect(normalized).toMatchObject({ kind: "leaf", id: "EXC-1", value: "pembrolizumab", sweepable: false });
  expect(normalized).not.toHaveProperty("sweepRange");
  expect(normalized).not.toHaveProperty("sweepStep");
});

test("selects only explicitly requested raw trials for a retry", () => {
  const second = { ...raw, protocolSection: { ...raw.protocolSection, identificationModule: { nctId: "NCT00000002", briefTitle: "Second trial" } } };
  expect(selectRawTrialsByNctIds([raw, second], ["NCT00000002"])).toEqual([second]);
  expect(() => selectRawTrialsByNctIds([raw], ["NCT99999999"])).toThrow(/absent from the raw cache/);
});

test("only flags explicit structural alternatives and retains their tree", async () => {
  const leaf = {
    kind: "leaf" as const,
    id: "INC-1",
    type: "inclusion" as const,
    predicate: "diagnosis" as const,
    operator: "==" as const,
    value: "advanced NSCLC",
    tier: 0 as const,
    sweepable: false,
    sourceSpan: "Advanced or metastatic NSCLC.",
  };
  const descriptive = validateCompiledTree(leaf, { type: "inclusion", sourceText: "Advanced or metastatic NSCLC." });
  expect(descriptive.success).toBe(true);
  if (descriptive.success) expect(descriptive.reviewReasons).toEqual([]);

  const explicitLeaf = { ...leaf, sourceSpan: "Either archival tissue or a new biopsy is required." };
  const explicit = validateCompiledTree(explicitLeaf, { type: "inclusion", sourceText: explicitLeaf.sourceSpan });
  expect(explicit.success).toBe(true);
  if (explicit.success) expect(explicit.reviewReasons).toEqual(["possible structural alternative has no OR group"]);

  const trial: RawClinicalTrial = {
    ...raw,
    protocolSection: { ...raw.protocolSection, eligibilityModule: { eligibilityCriteria: `Inclusion Criteria:\n- ${explicitLeaf.sourceSpan}` } },
  };
  const result = await compileTrial(trial, async () => explicitLeaf);
  expect(result.trial.needsHumanReview).toBe(true);
  expect(result.trial.criteria).toHaveLength(1);
  expect(result.reviewReasons).toEqual(["possible structural alternative has no OR group"]);
});

test("matches normalised source sub-clauses without requiring a whole bullet", () => {
  const source = "* “Histologically or cytologically confirmed” — advanced NSCLC.";
  const leaf = {
    kind: "leaf" as const,
    id: "INC-1",
    type: "inclusion" as const,
    predicate: "diagnosis" as const,
    operator: "==" as const,
    value: "NSCLC",
    tier: 0 as const,
    sweepable: false,
    sourceSpan: "\"Histologically or cytologically confirmed\" - advanced NSCLC",
  };
  expect(normalizeSourceText(source)).toContain(normalizeSourceText(leaf.sourceSpan));
  const checked = validateCompiledTree(leaf, { type: "inclusion", sourceText: source });
  expect(checked.success).toBe(true);
  if (checked.success) expect(checked.reviewReasons).toEqual([]);
});

test("retains and flags near-verbatim citations, but replaces unverifiable ones with the full block", () => {
  const source = "Participant has histologically confirmed non-small cell lung cancer.";
  const base = {
    kind: "leaf" as const,
    id: "INC-1",
    type: "inclusion" as const,
    predicate: "diagnosis" as const,
    operator: "==" as const,
    value: "non-small cell lung cancer",
    tier: 0 as const,
    sweepable: false,
  };
  const near = validateCompiledTree(
    { ...base, sourceSpan: "Participant has histologically confirmed non-small cell lung canser." },
    { type: "inclusion", sourceText: source },
  );
  expect(nearVerbatimSimilarity("Participant has histologically confirmed non-small cell lung canser.", source)).toBeGreaterThanOrEqual(0.9);
  expect(near.success).toBe(true);
  if (near.success) expect(near.reviewReasons).toEqual(["INC-1 sourceSpan near-verbatim"]);

  const unverifiable = validateCompiledTree(
    { ...base, sourceSpan: "Participant has melanoma." },
    { type: "inclusion", sourceText: source },
  );
  expect(unverifiable.success).toBe(true);
  if (unverifiable.success) {
    expect(unverifiable.data).toMatchObject({ sourceSpan: source });
    expect(unverifiable.reviewReasons).toEqual(["INC-1 sourceSpan not verifiable; full source block retained"]);
  }
});

test("records citation granularity without excluding an otherwise valid tree from the demo", async () => {
  const source = "Inclusion Criteria:\n- Participant has histologically confirmed non-small cell lung cancer.";
  const trial: RawClinicalTrial = { ...raw, protocolSection: { ...raw.protocolSection, eligibilityModule: { eligibilityCriteria: source } } };
  const result = await compileTrial(trial, async () => ({
    kind: "leaf", id: "INC-1", type: "inclusion", predicate: "diagnosis", operator: "==", value: "non-small cell lung cancer", tier: 0, sweepable: false,
    sourceSpan: "Participant has histologically confirmed non-small cell lung canser.",
  }));
  expect(result.trial.needsHumanReview).toBe(false);
  expect(result.reviewReasons).toBeUndefined();
  expect(result.citationFlags).toEqual(["INC-1 sourceSpan near-verbatim"]);
});

test("suffixes model-local ids when cohort headings repeat inside one trial", async () => {
  const cohorts: RawClinicalTrial = {
    ...raw,
    protocolSection: {
      ...raw.protocolSection,
      eligibilityModule: { eligibilityCriteria: "Cohort 1\nInclusion Criteria:\n- Age at least 50.\n\nCohort 2\nInclusion Criteria:\n- Age at least 55." },
    },
  };
  const result = await compileTrial(cohorts, async (block) => ({
    kind: "leaf", id: "INC-1", type: block.type === "unknown" ? "inclusion" : block.type,
    predicate: "age", operator: ">=", value: block.sourceText.includes("55") ? 55 : 50,
    tier: 1, sweepable: true, sweepRange: [0, 120], sweepStep: 1, sourceSpan: block.sourceText,
  }));
  expect(result.trial.criteria.map((node) => node.kind === "leaf" ? node.id : "group")).toEqual(["INC-1", "INC-1-2"]);
});
