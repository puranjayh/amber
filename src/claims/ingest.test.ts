import { describe, expect, it } from "vitest";
import { ageOn, isLungCancerIcd9, normalizeNdc, parseCsvLine, PART_B_HCPCS_DRUGS, renderCohortReport, resolveOpenFdaOralEgfrTkiNdc, travelMinutesProxy } from "@/src/claims/ingest";

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

  it("recognizes infused Part B drugs and normalizes FDA package NDCs", () => {
    expect(PART_B_HCPCS_DRUGS.J9045).toMatchObject({ drug: "carboplatin", drugClass: "PLATINUM" });
    expect(PART_B_HCPCS_DRUGS.J9299).toMatchObject({ drug: "nivolumab", drugClass: "IMMUNOTHERAPY" });
    expect(normalizeNdc("00078-0628-15")).toBe("00078062815");
    expect(normalizeNdc("50242-064-01")).toBe("50242006401");
  });

  it("uses openFDA package NDC results instead of a hand-built oral-drug list", async () => {
    const fetcher = async (url: string) => new Response(JSON.stringify({
      results: url.includes("erlotinib") ? [{ packaging: [{ package_ndc: "50242-064-01" }] }] : [{ packaging: [{ package_ndc: "00078-0628-15" }] }],
    }), { status: 200 });
    const resolved = await resolveOpenFdaOralEgfrTkiNdc(fetcher as typeof fetch);
    expect(resolved.get("50242006401")).toMatchObject({ drug: "erlotinib", drugClass: "EGFR_TKI" });
    expect(resolved.get("00078062815")).toMatchObject({ drug: "gefitinib", drugClass: "EGFR_TKI" });
  });

  it("names structural limits in the cohort report", () => {
    const report = renderCohortReport({ patients: [], cohortIds: new Set(), lungCancerClaimCount: 0, mappedPartBFacts: 0, mappedPdeFacts: 0, unresolvedPdeRows: 0 });
    expect(report).toContain("No lab values");
    expect(report).toContain("2008–2010");
    expect(report).toContain("Part B");
    expect(report).toContain("checkpoint-immunotherapy");
  });
});
