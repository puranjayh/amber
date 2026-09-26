import { expect, test } from "vitest";
import { catalogFor, suggestionCopy } from "./portal-copy";

test("trial suggestion is a conversation with the doctor — never a sign-up", () => {
  const catalog = catalogFor("PT-4401", [
    {
      nctId: "NCT07001001",
      title: "DEMO-FL: First-line therapy for untreated EGFR-mutant advanced NSCLC",
      phase: "PHASE3",
      travelMinutes: 25,
      blocking: "ECOG performance status of 0 or 1, assessed within 28 days before enrollment.",
    },
  ]);
  const copy = suggestionCopy(catalog, "NCT07001001");
  expect(copy?.cta).toBe("Talk to Dr Rahman about this.");
  expect(copy?.body).toMatch(/does not sign you up/i);
  expect(copy?.body).toMatch(/does not enrol/i);
  expect(copy?.cta).not.toMatch(/sign up|enrol now|enroll now/i);
});
