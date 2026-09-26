import { expect, test } from "vitest";
import type { Trial } from "@/src/contracts";
import { defaultBindingPick, pickAnalyteSweeps } from "./picks";

const leaf = (id: string, analyte: string, value: number) =>
  ({
    kind: "leaf" as const,
    id,
    type: "inclusion" as const,
    predicate: "lab_value" as const,
    operator: ">=" as const,
    value,
    analyte,
    tier: 1 as const,
    sourceSpan: `${analyte} ≥ ${value}`,
    sweepable: true,
  });

const trial = (nctId: string, leaves: ReturnType<typeof leaf>[]): Trial => ({
  nctId,
  title: nctId,
  phase: "PHASE2",
  condition: "NSCLC",
  slots: 1,
  criteria: leaves,
  compilerConfidence: 1,
  needsHumanReview: false,
});

test("picks one sweep per family and prefers the pin", () => {
  const pin = trial("NCT07001001", [leaf("INC-5", "ANC", 1500)]);
  const other = trial("NCT00000001", [
    leaf("INC-1", "ANC", 1000),
    leaf("INC-2", "albumin", 3),
    leaf("INC-3", "creatinine clearance", 45),
    leaf("INC-4", "Platelets", 100),
  ]);
  const flat = [{ threshold: 1, eligibleCount: 10, excludedByThisAlone: 0 }];
  const moving = [
    { threshold: 1, eligibleCount: 90, excludedByThisAlone: 0 },
    { threshold: 2, eligibleCount: 10, excludedByThisAlone: 0 },
  ];
  const sweeps = [
    { nctId: pin.nctId, criterionId: "INC-5", points: flat },
    { nctId: other.nctId, criterionId: "INC-1", points: moving },
    { nctId: other.nctId, criterionId: "INC-2", points: flat },
    { nctId: other.nctId, criterionId: "INC-3", points: flat },
    { nctId: other.nctId, criterionId: "INC-4", points: moving },
  ];
  const picks = pickAnalyteSweeps(sweeps, [pin, other], "NCT07001001");
  expect(picks.map((p) => `${p.family}:${p.nctId}`)).toEqual([
    "anc:NCT00000001",
    "albumin:NCT00000001",
    "crcl:NCT00000001",
    "platelets:NCT00000001",
  ]);
});

test("defaultBindingPick is the platelets sweep that actually moves", () => {
  const pin = trial("NCT07001001", [leaf("INC-5", "ANC", 1500)]);
  const plt = trial("NCT03838159", [leaf("INC-6", "Platelets", 100)]);
  const picks = pickAnalyteSweeps(
    [
      { nctId: pin.nctId, criterionId: "INC-5", points: [{ threshold: 1, eligibleCount: 10, excludedByThisAlone: 0 }] },
      {
        nctId: plt.nctId,
        criterionId: "INC-6",
        points: [
          { threshold: 1, eligibleCount: 193, excludedByThisAlone: 0 },
          { threshold: 2, eligibleCount: 94, excludedByThisAlone: 0 },
        ],
      },
    ],
    [pin, plt],
    "NCT07001001",
  );
  expect(defaultBindingPick(picks)).toMatchObject({ nctId: "NCT03838159", criterionId: "INC-6" });
});

test("pin wins a family when the eligible swing is the same", () => {
  const pin = trial("NCT07001001", [leaf("INC-5", "ANC", 1500)]);
  const other = trial("NCT00000001", [leaf("INC-1", "ANC", 1000)]);
  const points = [
    { threshold: 1, eligibleCount: 10, excludedByThisAlone: 0 },
    { threshold: 2, eligibleCount: 4, excludedByThisAlone: 0 },
  ];
  const picks = pickAnalyteSweeps(
    [
      { nctId: pin.nctId, criterionId: "INC-5", points },
      { nctId: other.nctId, criterionId: "INC-1", points },
    ],
    [pin, other],
    "NCT07001001",
  );
  expect(picks[0]).toMatchObject({ family: "anc", nctId: "NCT07001001", swing: 6 });
});
