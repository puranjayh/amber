import { expect, test } from "vitest";
import type { LoopNudge } from "@/app/_data/schema";
import { enrolCopy, groupEnrolNudges, splitForNudge } from "./group";

const base = {
  kind: "enrol_patient" as const,
  fromRole: "coordinator" as const,
  toRole: "physician" as const,
  status: "pending" as const,
  createdAt: "2026-09-26T12:00:00.000Z",
};

test("enrolCopy is one sentence for a grouped ping", () => {
  expect(enrolCopy(4, ["NCT07001001"])).toBe("Trial coordinator flagged 4 of your patients for NCT07001001.");
  expect(enrolCopy(1, ["NCT07001001"])).toBe("Trial coordinator flagged 1 of your patients for NCT07001001.");
  expect(enrolCopy(3, ["NCT07001001", "NCT03838159"])).toBe(
    "Trial coordinator flagged 3 of your patients for NCT07001001 and 1 other trial.",
  );
});

test("groupEnrolNudges collapses a shared batchId into one card", () => {
  const nudges: LoopNudge[] = [
    { ...base, id: "a", patientId: "PT-1", nctId: "NCT07001001", batchId: "batch-1" },
    { ...base, id: "b", patientId: "PT-2", nctId: "NCT07001001", batchId: "batch-1" },
    { ...base, id: "c", patientId: "PT-3", nctId: "NCT07001001" },
  ];
  const groups = groupEnrolNudges(nudges, new Set(["PT-1", "PT-2", "PT-3"]));
  expect(groups).toHaveLength(2);
  const batched = groups.find((g) => g.batchId === "batch-1");
  expect(batched?.patientIds).toEqual(["PT-1", "PT-2"]);
  expect(enrolCopy(batched!.patientIds.length, batched!.nctIds)).toContain("2 of your patients");
});

test("groupEnrolNudges ignores other physicians' patients and done rows", () => {
  const nudges: LoopNudge[] = [
    { ...base, id: "a", patientId: "PT-1", nctId: "NCT1", batchId: "x" },
    { ...base, id: "b", patientId: "PT-9", nctId: "NCT1", batchId: "x" },
    { ...base, id: "c", patientId: "PT-2", nctId: "NCT1", status: "done" },
  ];
  const groups = groupEnrolNudges(nudges, new Set(["PT-1", "PT-2"]));
  expect(groups).toHaveLength(1);
  expect(groups[0]?.patientIds).toEqual(["PT-1"]);
});

test("missing preferences stay on Ask — they never join the enrol set", () => {
  const prefs = {
    "PT-ready": {
      maxTravelMinutes: 90,
      maxExtraVisitsPerMonth: 2,
      acceptsPlacebo: false,
      driver: "family" as const,
    },
  };
  const split = splitForNudge(["PT-ready", "PT-4401"], prefs);
  expect(split.reachable).toEqual(["PT-ready"]);
  expect(split.missing).toEqual(["PT-4401"]);
});
