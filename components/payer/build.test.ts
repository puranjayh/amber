import { expect, test } from "vitest";
import { AS_OF, loadInputs } from "@/app/_data/inputs";
import { buildPayerView } from "@/app/_data/payer";
import { CLAIMS_STUB } from "./stub";

const { trials } = loadInputs(process.cwd() + "/");
const fixtures = trials.filter((t) => /^NCT07001\d+$/.test(t.nctId));

test("a drug fill settles first-line; an ILD claim settles the comorbidity trials", () => {
  const view = buildPayerView(CLAIMS_STUB, fixtures, AS_OF, null, "stub");
  expect(view.headline).toMatch(/rule patients out/);
  expect(view.settled.some((r) => r.kind === "drug fill" && r.patientId === "BENE-441201")).toBe(true);
  expect(view.settled.some((r) => r.kind === "comorbidity" && r.patientId === "BENE-441202")).toBe(true);
  expect(view.settled.every((r) => r.claimLine.length > 0)).toBe(true);
});

test("remaining criteria stay UNKNOWN and group by what a chart would need", () => {
  const view = buildPayerView(CLAIMS_STUB, fixtures, AS_OF, null, "stub");
  expect(view.needs.length).toBeGreaterThan(0);
  expect(view.needs.some((n) => n.predicate === "biomarker")).toBe(true);
  expect(view.needs.some((n) => n.predicate === "performance_status")).toBe(true);
  expect(view.needs.every((n) => n.patientIds.length > 0)).toBe(true);
});
