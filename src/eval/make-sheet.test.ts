import { describe, expect, it } from "vitest";
import patients from "@/fixtures/patients.sample.json";
import trials from "@/fixtures/trials.sample.json";
import { buildLabellingRows, toLabellingCsv } from "@/src/eval/make-sheet";

describe("blind labelling-sheet generator", () => {
  it("emits a blank row per patient, trial, and leaf with verbatim criterion text", () => {
    const rows = buildLabellingRows(patients, trials);
    expect(rows).toHaveLength(60);
    const age = rows.find((row) => row.patient_id === "PT-4401" && row.nct_id === "NCT07001001" && row.criterion_id === "INC-1");
    expect(age).toMatchObject({
      criterion_type: "inclusion",
      criterion_text: "Age ≥ 18 years at screening.",
      verdict: "",
      reason: "",
      notes: "",
    });
    expect(age!.patient_evidence).toContain('"Age 67 years, recorded at registration on 1 September 2026."');
  });

  it("uses the literal empty-record marker and escapes source quotes in CSV", () => {
    const rows = buildLabellingRows(patients, trials);
    const absent = rows.find((row) => row.patient_id === "PT-4401" && row.nct_id === "NCT07001001" && row.criterion_id === "INC-3");
    expect(absent!.patient_evidence).toBe("NOTHING IN RECORD");
    expect(toLabellingCsv(rows)).toContain('"""Age 67 years, recorded at registration on 1 September 2026.""');
  });
});
