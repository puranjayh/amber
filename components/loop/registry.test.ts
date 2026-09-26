import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { LoopNudge, RegistryStudy } from "@/app/_data/schema";
import { fetchStudy, parseStudy } from "@/app/_data/ctgov";
import { Propagation } from "./Propagation";
import {
  diffRegistry,
  distancePhrase,
  followUpsPrompted,
  forAudience,
  nearestSite,
  patientUpdateCopy,
  propagationLines,
} from "./registry";

const closed: RegistryStudy = {
  nctId: "NCT02496663",
  overallStatus: "ACTIVE_NOT_RECRUITING",
  lastUpdatePostDate: "2026-07-31",
  primaryCompletionDate: "2027-06-30",
  sites: [
    { facility: "City of Hope Comprehensive Cancer Center", city: "Duarte", state: "California", lat: 34.14, lon: -117.98 },
  ],
};

function nudge(partial: Partial<LoopNudge> & Pick<LoopNudge, "id" | "patientId" | "kind">): LoopNudge {
  return {
    fromRole: "physician",
    toRole: "patient",
    nctId: "NCT02496663",
    status: "pending",
    createdAt: "2026-09-26T00:00:00.000Z",
    ...partial,
  };
}

test("enrollment count is the registry's enrollmentInfo.count", () => {
  const study = parseStudy("NCT02496663", {
    protocolSection: {
      statusModule: { overallStatus: "ACTIVE_NOT_RECRUITING" },
      designModule: { enrollmentInfo: { count: 138 } },
    },
  });
  expect(study?.enrollmentCount).toBe(138);
});

test("nearest site is the closest registry location, not the first one listed", () => {
  const near = nearestSite(
    [
      { facility: "Far hospital", city: "Boston", lat: 42.36, lon: -71.06 },
      { facility: "City of Hope Comprehensive Cancer Center", city: "Duarte", lat: 34.13945, lon: -117.97729 },
    ],
    { lat: 34.0522, lon: -118.2437 },
  );
  expect(near?.site.city).toBe("Duarte");
  expect(distancePhrase(near!.km)).toMatch(/about \d+ miles/);
  expect(distancePhrase(near!.km)).not.toMatch(/hours/);
});

test("the first look at a closed study reports the registry fact and does not invent a prior status", () => {
  const [change] = diffRegistry(undefined, closed);
  expect(change.detail).toContain("ACTIVE_NOT_RECRUITING");
  expect(change.detail).toContain("2026-07-31");
  expect(change.detail).toContain("closed to new patients");
  expect(change.detail).toContain("2027-06-30");
  expect(change.detail).toContain("1 site.");
  expect(change.detail).not.toMatch(/moved from/);
  expect(change.detail).not.toContain("RECRUITING →");
});

test("a later status change quotes both sides", () => {
  const next = { ...closed, overallStatus: "COMPLETED", lastUpdatePostDate: "2026-09-01" };
  const changes = diffRegistry({ ...closed, overallStatus: "RECRUITING" }, next);
  expect(changes[0].detail).toContain("moved from RECRUITING to COMPLETED");
  expect(changes[0].detail).toContain("finished");
});

test("a moved completion date and a nearer new site are separate changes", () => {
  const next: RegistryStudy = {
    ...closed,
    primaryCompletionDate: "2028-01-15",
    sites: [
      ...closed.sites,
      { facility: "Bellevue", city: "New York", state: "New York", lat: 40.74, lon: -73.98 },
    ],
  };
  const changes = diffRegistry(closed, next, { lat: 40.75, lon: -73.98 });
  expect(changes.map((row) => row.detail).join("\n")).toMatch(/moved from 2027-06-30 to 2028-01-15/);
  expect(changes.map((row) => row.detail).join("\n")).toMatch(/nearer than the previous closest site/);
});

test("a new site without coordinates is not called nearer", () => {
  const next: RegistryStudy = {
    ...closed,
    sites: [...closed.sites, { facility: "County clinic", city: "Albany", state: "New York" }],
  };
  const [change] = diffRegistry(closed, next);
  expect(change.detail).toContain("A new site is listed: County clinic, Albany, New York");
  expect(change.detail).not.toMatch(/nearer/);
});

test("an open study on first sight is not news", () => {
  expect(diffRegistry(undefined, { ...closed, overallStatus: "RECRUITING" })).toEqual([]);
});

test("the patient is told there is news and nothing else", () => {
  const sentence = patientUpdateCopy("Dr Rahman");
  expect(sentence).toBe(
    "There's an update on the trial you discussed with Dr Rahman. Book a follow-up to hear more.",
  );
  expect(sentence).not.toMatch(/ACTIVE_NOT_RECRUITING|clinicaltrials|ECOG|exon/i);
});

test("follow-ups prompted count only updates the patient was actually told about", () => {
  const nudges = [
    nudge({ id: "a", patientId: "PT-4410", kind: "trial_update", held: true }),
    nudge({ id: "b", patientId: "PT-4410", kind: "trial_update", held: false }),
    nudge({ id: "c", patientId: "PT-9", kind: "trial_update", held: false }),
  ];
  expect(followUpsPrompted(nudges, new Set(["PT-4410"]))).toBe(1);
});

test("the coordinator line carries the trial fact and not the patient id", () => {
  const nudges = [
    nudge({
      id: "a",
      patientId: "PT-4410",
      kind: "trial_update",
      held: true,
      detail: "ClinicalTrials.gov lists this study as ACTIVE_NOT_RECRUITING, last updated 2026-07-31.",
      changeKey: "status:ACTIVE_NOT_RECRUITING@2026-07-31",
    }),
  ];
  const markup = renderToStaticMarkup(createElement(Propagation, { nudges }));
  expect(markup).toContain("ACTIVE_NOT_RECRUITING");
  expect(markup).toContain("waiting on the physician");
  expect(markup).not.toContain("PT-4410");
  expect(propagationLines(nudges)[0].waiting).toBe(1);
});

test("a patient response drops the registry detail", () => {
  const state = forAudience(
    {
      backend: "file",
      preferences: [],
      notes: [],
      registry: [{ nctId: "NCT02496663", fetchedAt: "2026-09-26T00:00:00.000Z", study: closed }],
      releases: [],
      nudges: [
        nudge({
          id: "a",
          patientId: "PT-4410",
          kind: "trial_update",
          detail: "ACTIVE_NOT_RECRUITING",
          changeKey: "status:ACTIVE_NOT_RECRUITING@2026-07-31",
        }),
      ],
    },
    "patient",
  );
  expect(state.registry).toEqual([]);
  expect(state.nudges[0].detail).toBeUndefined();
  expect(state.nudges[0].nctId).toBeNull();
  expect(JSON.stringify(state)).not.toContain("ACTIVE_NOT_RECRUITING");
  expect(JSON.stringify(state)).not.toContain("NCT02496663");
});

test("parseStudy reads the ClinicalTrials.gov study shape", () => {
  const study = parseStudy("NCT02496663", {
    protocolSection: {
      statusModule: {
        overallStatus: "ACTIVE_NOT_RECRUITING",
        lastUpdatePostDateStruct: { date: "2026-07-31" },
        primaryCompletionDateStruct: { date: "2027-06-30" },
      },
      contactsLocationsModule: {
        locations: [
          {
            facility: "City of Hope Comprehensive Cancer Center",
            city: "Duarte",
            state: "California",
            country: "United States",
            geoPoint: { lat: 34.13945, lon: -117.97729 },
          },
        ],
      },
    },
  });
  expect(study?.overallStatus).toBe("ACTIVE_NOT_RECRUITING");
  expect(study?.lastUpdatePostDate).toBe("2026-07-31");
  expect(study?.sites[0].lat).toBeCloseTo(34.14);
});

test("NCT02496663 on ClinicalTrials.gov is the closed study last posted 2026-07-31", async () => {
  const study = await fetchStudy("NCT02496663");
  expect(study?.overallStatus).toBe("ACTIVE_NOT_RECRUITING");
  expect(study?.lastUpdatePostDate).toBe("2026-07-31");
  expect(study?.primaryCompletionDate).toBe("2027-06-30");
  expect(study?.sites.length).toBeGreaterThan(0);
});
