import { expect, test } from "vitest";
import { rankPatientTrials, suggestPeers } from "./rank";

test("eligibility leads, and worth breaks a close call", () => {
  const ranked = rankPatientTrials([
    { nctId: "NCT00000003", eliminated: true, unknownCount: 0, expectedValue: 9, resolutionCost: 0 },
    { nctId: "NCT00000002", eliminated: false, unknownCount: 4, expectedValue: 9, resolutionCost: 0 },
    { nctId: "NCT00000001", eliminated: false, unknownCount: 1, expectedValue: 1, resolutionCost: 0 },
    { nctId: "NCT00000004", eliminated: false, unknownCount: 2, expectedValue: 3, resolutionCost: 0 },
  ]);
  expect(ranked.map((row) => row.nctId)).toEqual([
    "NCT00000004",
    "NCT00000001",
    "NCT00000002",
    "NCT00000003",
  ]);
});

test("suggested patients share the blocker, then the diagnosis", () => {
  const self = { patientId: "PT-1", name: "PT-1", nctId: "NCT1", blockingId: "INC-2", diagnosis: "NSCLC, stage IV" };
  const peers = suggestPeers(self, [
    self,
    { patientId: "PT-2", name: "PT-2", nctId: "NCT1", blockingId: "INC-2", diagnosis: "NSCLC, stage III" },
    { patientId: "PT-3", name: "PT-3", nctId: "NCT1", blockingId: "EXC-9", diagnosis: "NSCLC, stage IV" },
    { patientId: "PT-4", name: "PT-4", nctId: "NCT1", blockingId: "INC-10", diagnosis: "NSCLC, stage I" },
  ]);
  expect(peers.map((row) => row.patientId)).toEqual(["PT-2", "PT-3"]);
  expect(peers.map((row) => row.sameBlocker)).toEqual([true, false]);
});
