import { describe, expect, it } from "vitest";
import cube from "@/fixtures/cube.sample.json";
import patients from "@/fixtures/patients.sample.json";
import trials from "@/fixtures/trials.sample.json";
import { evaluateHumanLabels, normalizeHumanLabels } from "@/src/eval";

describe("evaluation harness", () => {
  it("matches the hand-authored fixture cube and produces app-ready metrics", () => {
    const labels = normalizeHumanLabels(cube);
    const report = evaluateHumanLabels({ labels, patients, trials, asOf: "2026-09-25", labelSource: "fixture" });

    expect(report.issues).toEqual([]);
    expect(report.labelSource).toBe("fixture");
    expect(report.reportClass).toBe("FIXTURE_CHECK");
    expect(report.evaluatedCells).toBe(labels.length);
    expect(report.disagreements).toEqual([]);
    expect(report.confusionMatrix.PASS.PASS).toBeGreaterThan(0);
    expect(report.confusionMatrix.FAIL.FAIL).toBeGreaterThan(0);
    expect(report.confusionMatrix.UNKNOWN.UNKNOWN).toBeGreaterThan(0);
    expect(report.precision).toBe(1);
    expect(report.recall).toBe(1);
    expect(report.unknownAgreement).toBe(1);
  });

  it("retains both citations on every reported disagreement", () => {
    const labels = normalizeHumanLabels(cube);
    labels[0] = { ...labels[0], expected: "FAIL" };
    const report = evaluateHumanLabels({ labels, patients, trials, asOf: "2026-09-25", labelSource: "model-draft" });

    expect(report.disagreements).toHaveLength(1);
    expect(report.labelSource).toBe("model-draft");
    expect(report.reportClass).toBe("DRAFT_MODEL_AGREEMENT_NOT_FOR_PRESENTATION");
    expect(report.labelSourceNotice).toContain("NOT HUMAN-VALIDATED");
    expect(report.disagreements[0]).toMatchObject({
      patientId: "PT-4401",
      criterionId: "INC-1",
      expected: "FAIL",
      actual: "PASS",
      criterionCitation: "Age ≥ 18 years at screening.",
    });
    expect(report.disagreements[0].chartCitation).toContain("Age 67 years");
  });
});
