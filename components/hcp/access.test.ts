import { expect, test } from "vitest";
import { doctorChartPath, doctorMayOpen } from "./access";

test("a physician opens only a patient already on their panel", () => {
  const panel = new Set(["PT-4401"]);
  expect(doctorMayOpen(undefined, panel)).toBe("closed");
  expect(doctorMayOpen("PT-4401", panel)).toBe("open");
  expect(doctorMayOpen("PT-9999", panel)).toBe("denied");
});

test("a chart stays inside the doctor portal", () => {
  const href = doctorChartPath({
    physicianId: "hcp-rahman",
    patientId: "PT-4401",
    trialId: "NCT07001001",
    demo: "static",
  });
  expect(href.startsWith("/doctor/patient/PT-4401")).toBe(true);
  expect(href).toContain("physician=hcp-rahman");
  expect(href).toContain("trial=NCT07001001");
  expect(href).not.toContain("/hcp");
});
