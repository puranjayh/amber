import { expect, test } from "vitest";
import type { HcpPatientRow, HcpTrialRow } from "@/app/_data/schema";
import {
  costThem,
  phaseVisits,
  rankPatientsForPhysician,
  rankTrialsByWorth,
  titleSuggestsPlacebo,
  trialFits,
  trialWorth,
} from "./worth";

const trial = (over: Partial<HcpTrialRow> = {}): HcpTrialRow => ({
  nctId: "NCT00000001",
  title: "Study",
  phase: "PHASE2",
  unknownCount: 2,
  expectedValue: 0.5,
  resolutionCost: 3,
  travelMinutes: 45,
  visitBurden: 2,
  likelyPlacebo: false,
  worth: 0,
  ...over,
});

test("phaseVisits is higher for phase 1 than phase 3", () => {
  expect(phaseVisits("PHASE1")).toBe(4);
  expect(phaseVisits("EARLY_PHASE1")).toBe(4);
  expect(phaseVisits("PHASE2")).toBe(2);
  expect(phaseVisits("PHASE2/PHASE3")).toBe(1);
  expect(phaseVisits("NA")).toBe(2);
});

test("placebo is title-only — randomized is not a guess", () => {
  expect(titleSuggestsPlacebo("Pembrolizumab versus placebo")).toBe(true);
  expect(titleSuggestsPlacebo("Randomized double-blind study of drug X")).toBe(false);
});

test("no ride doubles travel in the cost the patient bears", () => {
  expect(costThem(3, 60, 2)).toBe(3 + 2 + 2);
  expect(costThem(3, 60, 2, "none")).toBe(3 + 4 + 2);
});

test("worth is significance over cost — a cheaper pair outranks a distant one", () => {
  const near = trialWorth(0.5, 3, 15, 1);
  const far = trialWorth(0.5, 3, 180, 1);
  expect(near).toBeGreaterThan(far);
});

test("portal filters too-far and placebo, then worth-sorts the rest", () => {
  const rows = [
    trial({ nctId: "NCT00000001", travelMinutes: 200, expectedValue: 0.9, worth: 9 }),
    trial({ nctId: "NCT00000002", travelMinutes: 20, expectedValue: 0.2, worth: 2 }),
    trial({
      nctId: "NCT00000003",
      travelMinutes: 30,
      expectedValue: 0.8,
      likelyPlacebo: true,
      title: "Drug vs placebo",
    }),
  ];
  const ranked = rankTrialsByWorth(rows, { maxTravelMinutes: 90, acceptsPlacebo: false });
  expect(ranked.map((r) => r.nctId)).toEqual(["NCT00000002", "NCT00000003", "NCT00000001"]);
  expect(trialFits(rows[0], { maxTravelMinutes: 90 }).reasons).toContain("too far");
});

test("patient list re-ranks when portal answers close the previous best trial", () => {
  const far: HcpPatientRow = {
    patientId: "PT-A",
    unknownCount: 0,
    expectedValue: 0.9,
    resolutionCost: 1,
    travelMinutes: 200,
    bestNctId: "NCT00000001",
    liveTrials: 1,
    portal: {},
    trials: [trial({ nctId: "NCT00000001", travelMinutes: 200, unknownCount: 0, expectedValue: 0.9 })],
  };
  const near: HcpPatientRow = {
    patientId: "PT-B",
    unknownCount: 3,
    expectedValue: 0.2,
    resolutionCost: 6,
    travelMinutes: 20,
    bestNctId: "NCT00000002",
    liveTrials: 1,
    portal: {},
    trials: [trial({ nctId: "NCT00000002", travelMinutes: 20, unknownCount: 3, expectedValue: 0.2 })],
  };
  const ranked = rankPatientsForPhysician([far, near], {
    "PT-A": { maxTravelMinutes: 60 },
  });
  expect(ranked.map((r) => r.patientId)).toEqual(["PT-B", "PT-A"]);
});
