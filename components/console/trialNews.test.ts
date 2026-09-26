import { expect, test } from "vitest";
import type { RegistryStudy } from "@/app/_data/schema";
import { followUpsByTrial, trialNews } from "./trialNews";

function study(partial: Partial<RegistryStudy> & Pick<RegistryStudy, "nctId">): RegistryStudy {
  return {
    overallStatus: "RECRUITING",
    lastUpdatePostDate: null,
    primaryCompletionDate: null,
    sites: [],
    ...partial,
  };
}

test("a trial with one posted update produces one feed line, newest first", () => {
  const items = trialNews(
    [
      {
        nctId: "NCT06281964",
        title: "PLB1004",
        study: study({
          nctId: "NCT06281964",
          overallStatus: "RECRUITING",
          lastUpdatePostDate: "2026-09-12",
          primaryCompletionDate: "2028-01-15",
        }),
      },
      {
        nctId: "NCT02496663",
        title: "Osimertinib and Necitumumab",
        study: study({
          nctId: "NCT02496663",
          overallStatus: "ACTIVE_NOT_RECRUITING",
          lastUpdatePostDate: "2026-07-31",
          primaryCompletionDate: "2027-06-30",
        }),
      },
      {
        nctId: "NCT00000001",
        title: "Undated",
        study: study({ nctId: "NCT00000001", overallStatus: "RECRUITING" }),
      },
    ],
    new Map([["NCT02496663", 1]]),
  );
  expect(items.map((item) => item.nctId)).toEqual(["NCT06281964", "NCT02496663"]);
  expect(items[0]?.dateLabel).toBe("12 Sep 2026");
  expect(items[0]?.text).toContain("status changed to RECRUITING");
  expect(items[0]?.text).toContain("Primary completion 15 Jan 2028");
  expect(items[1]?.text).toContain("status changed to ACTIVE_NOT_RECRUITING");
  expect(items[1]?.text).toContain("Closed to new patients");
  expect(items[1]?.text).toContain("Primary completion 30 Jun 2027");
  expect(items[1]?.followUps).toBe(1);
  expect(items[0]?.followUps).toBe(0);
});

test("follow-ups count only patients this doctor was allowed to tell", () => {
  const counts = followUpsByTrial(
    [
      {
        id: "a",
        kind: "trial_update",
        fromRole: "coordinator",
        toRole: "patient",
        patientId: "PT-4410",
        nctId: "NCT02496663",
        status: "open",
        createdAt: "2026-09-26T00:00:00.000Z",
        held: false,
      },
      {
        id: "b",
        kind: "trial_update",
        fromRole: "coordinator",
        toRole: "patient",
        patientId: "PT-4410",
        nctId: "NCT02496663",
        status: "open",
        createdAt: "2026-09-26T00:00:00.000Z",
        held: true,
      },
      {
        id: "c",
        kind: "trial_update",
        fromRole: "coordinator",
        toRole: "patient",
        patientId: "PT-9",
        nctId: "NCT02496663",
        status: "open",
        createdAt: "2026-09-26T00:00:00.000Z",
        held: false,
      },
    ],
    new Set(["PT-4410"]),
  );
  expect(counts.get("NCT02496663")).toBe(1);
});
