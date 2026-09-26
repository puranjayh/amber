import { expect, test } from "vitest";
import { trialsByWorth } from "./patientTrials";

test("worth ranking drops an eliminated trial and prefers the cheaper live pair", () => {
  const rows = trialsByWorth(
    [
      { nctId: "NCT00000001", unknownCount: 1, expectedValue: 0.2, resolutionCost: 20, eliminated: false },
      { nctId: "NCT00000002", unknownCount: 1, expectedValue: 0.5, resolutionCost: 1, eliminated: false },
      { nctId: "NCT00000003", unknownCount: 0, expectedValue: 1, resolutionCost: 0, eliminated: true },
    ],
    () => undefined,
    undefined,
  );
  expect(rows.map((row) => row.nctId)).toEqual(["NCT00000002", "NCT00000001"]);
});
