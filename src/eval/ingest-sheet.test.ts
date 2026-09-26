import { describe, expect, it } from "vitest";
import { labelsFromSheet } from "@/src/eval/ingest-sheet";
import { LABELLING_COLUMNS } from "@/src/eval/make-sheet";

const header = LABELLING_COLUMNS.join(",");

describe("labelling-sheet ingestion", () => {
  it("maps a filled row into the frozen EvalSet contract", () => {
    const csv = `${header}\nPT-4401,NCT07001001,INC-1,inclusion,Age ≥ 18,NOTHING IN RECORD,PASS,satisfied,"reviewed manually"\n`;
    expect(labelsFromSheet(csv, "Dr. Example")).toEqual([{
      patientId: "PT-4401",
      nctId: "NCT07001001",
      criterionId: "INC-1",
      expected: "PASS",
      expectedReason: "satisfied",
      labeller: "Dr. Example",
      note: "reviewed manually",
    }]);
  });

  it("rejects blank verdicts rather than silently creating labels", () => {
    const csv = `${header}\nPT-4401,NCT07001001,INC-1,inclusion,Age ≥ 18,NOTHING IN RECORD,,,\n`;
    expect(() => labelsFromSheet(csv, "Dr. Example")).toThrow(/needs a PASS/);
  });
});
