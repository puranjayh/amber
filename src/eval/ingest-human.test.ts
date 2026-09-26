import { describe, expect, it } from "vitest";
import { parseHumanLabels } from "@/src/eval/ingest-human";
import { evaluateHumanLabels } from "@/src/eval";
import patients from "@/fixtures/patients.sample.json";
import trials from "@/fixtures/trials.sample.json";

describe("human-label ingestion", () => {
  it("retains valid human labels in the frozen EvalSet shape", () => {
    expect(parseHumanLabels([{
      patientId: "PT-4401",
      nctId: "NCT07001001",
      criterionId: "INC-1",
      expected: "PASS",
      expectedReason: "satisfied",
      labeller: "Dr. Example",
      note: "Reviewed blind.",
    }])).toEqual([{
      patientId: "PT-4401",
      nctId: "NCT07001001",
      criterionId: "INC-1",
      expected: "PASS",
      expectedReason: "satisfied",
      labeller: "Dr. Example",
      note: "Reviewed blind.",
    }]);
  });

  it("refuses a model draft presented as human ground truth", () => {
    expect(() => parseHumanLabels([{
      patientId: "PT-4401",
      nctId: "NCT07001001",
      criterionId: "INC-1",
      expected: "PASS",
      labeller: "model-draft",
    }])).toThrow(/model-draft/);
  });

  it("marks human results as a report distinct from the draft-model result", () => {
    const report = evaluateHumanLabels({
      labels: [{ patientId: "PT-4401", nctId: "NCT07001001", criterionId: "INC-1", expected: "PASS" }],
      patients,
      trials,
      asOf: "2026-09-25",
      labelSource: "human",
    });
    expect(report.reportClass).toBe("HUMAN_LABELLED_EVALUATION");
    expect(report.labelSourceNotice).toContain("HUMAN-LABELLED");
  });
});
