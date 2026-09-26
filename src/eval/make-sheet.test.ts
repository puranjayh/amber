import { describe, expect, it } from "vitest";
import patients from "@/fixtures/patients.sample.json";
import trials from "@/fixtures/trials.sample.json";
import { buildLabellingRows, toLabellingCsv } from "@/src/eval/make-sheet";

describe("blind labelling-sheet generator", () => {
  it("emits a blank row per patient, trial, and leaf with verbatim criterion text", () => {
    const rows = buildLabellingRows(patients, trials);
    // One row per patient x trial x leaf. Derived, not hardcoded — the fixtures
    // gain criteria as the demo grows and a fixed count just breaks the build.
    const leafCount = (node: unknown): number => {
      const n = node as { kind?: string; children?: unknown[] };
      if (n?.kind === "leaf") return 1;
      return (n?.children ?? []).reduce((sum: number, c) => sum + leafCount(c), 0);
    };
    const leaves = trials.reduce(
      (sum, t) => sum + (t.criteria as unknown[]).reduce((s2: number, c) => s2 + leafCount(c), 0),
      0,
    );
    expect(rows).toHaveLength(patients.length * leaves);
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
