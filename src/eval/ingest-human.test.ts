import { describe, expect, it } from "vitest";
import { parseHumanLabels } from "@/src/eval/ingest-human";

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
});
