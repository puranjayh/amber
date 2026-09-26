import { describe, expect, it } from "vitest";
import { ageOn, isLungCancerIcd9, parseCsvLine, renderCohortReport, travelMinutesProxy } from "@/src/claims/ingest";

describe("claims ingestion helpers", () => {
  it("parses quoted DE-SynPUF headings without changing field values", () => {
    expect(parseCsvLine('"DESYNPUF_ID","BENE_BIRTH_DT"')).toEqual(["DESYNPUF_ID", "BENE_BIRTH_DT"]);
    expect(parseCsvLine('A,"quoted, value"')).toEqual(["A", "quoted, value"]);
  });

  it("identifies ICD-9 162.x but not a neighboring diagnosis family", () => {
    expect(isLungCancerIcd9("1623")).toBe(true);
    expect(isLungCancerIcd9("162.9")).toBe(true);
    expect(isLungCancerIcd9("1639")).toBe(false);
  });

  it("derives age and a deterministic geography proxy without inventing a lab", () => {
    expect(ageOn("19230501")).toBe(87);
    expect(travelMinutesProxy("26", "950")).toBe(55);
  });

  it("names structural limits in the cohort report", () => {
    const report = renderCohortReport({ patients: [], cohortIds: new Set(), lungCancerClaimCount: 0, mappedPdeFacts: 0, unresolvedPdeRows: 0 });
    expect(report).toContain("No lab values");
    expect(report).toContain("2008–2010");
  });
});
