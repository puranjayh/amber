import { describe, expect, it } from "vitest";
import { Assignment as AssignmentSchema } from "@/src/contracts";
import { match, matchAdhoc, phaseRank } from "./match";
import { buildPriorTable } from "./priors";
import { fact, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/** Always satisfiable, so eligibility never gets in the way of the matching. */
const adult = leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18, sourceSpan: "Age >= 18" });

/** An ANC floor, so some patients can be made ineligible on purpose. */
const ancFloor = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  tier: 1,
  sourceSpan: "ANC >= 1500/uL",
});

const candidate = (
  id: string,
  over: { race?: string; travelMinutes?: number; anc?: number; unknowns?: boolean } = {},
) =>
  patient({
    id,
    age: 60,
    race: over.race ?? "White",
    travelMinutes: over.travelMinutes,
    facts:
      over.anc === undefined
        ? []
        : [
            fact({
              predicate: "lab_value",
              analyte: "ANC",
              value: over.anc,
              unit: "/uL",
              observedAt: "2026-09-20",
              sourceQuote: `ANC ${over.anc}/uL`,
            }),
          ],
  });

const site = (nctId: string, slots: number, over: Partial<Parameters<typeof trial>[0]> = {}) =>
  trial({ nctId, slots, criteria: [adult, ancFloor], ...over });

const seatsOf = (a: ReturnType<typeof match>, nctId: string) =>
  a.pairs.filter((p) => p.nctId === nctId).map((p) => p.patientId);

describe("phaseRank", () => {
  it("reads the phase number", () => {
    expect(phaseRank("PHASE1")).toBe(1);
    expect(phaseRank("PHASE3")).toBe(3);
  });

  it("puts an early phase 1 below a phase 1", () => {
    expect(phaseRank("EARLY_PHASE1")).toBe(0.5);
  });

  it("ranks a combined phase by its highest arm", () => {
    expect(phaseRank("PHASE2/PHASE3")).toBe(3);
  });

  it("sorts an unlabelled phase last rather than guessing", () => {
    expect(phaseRank("NA")).toBe(0);
    expect(phaseRank("")).toBe(0);
  });
});

describe("capacity", () => {
  it("never seats more patients than a trial has slots", () => {
    const a = match([candidate("PT-1", { anc: 3000 }), candidate("PT-2", { anc: 3000 }), candidate("PT-3", { anc: 3000 })], [site("NCT00000001", 2)], ASOF);
    expect(a.enrolled).toBe(2);
    expect(seatsOf(a, "NCT00000001")).toHaveLength(2);
  });

  it("seats the trial's top-ranked candidates, not the first to arrive", () => {
    // PT-3 has a resolved ANC (no unknowns); the others are silent on it.
    const a = match(
      [candidate("PT-1"), candidate("PT-2"), candidate("PT-3", { anc: 3000 })],
      [site("NCT00000001", 1)],
      ASOF,
    );
    expect(seatsOf(a, "NCT00000001")).toEqual(["PT-3"]);
  });

  it("seats nobody at a trial with no slots", () => {
    const a = match([candidate("PT-1", { anc: 3000 })], [site("NCT00000001", 0)], ASOF);
    expect(a.enrolled).toBe(0);
  });

  it("leaves an eliminated patient out of the market entirely", () => {
    const tooYoung = patient({ id: "PT-KID", age: 9, race: "White" });
    const a = match([tooYoung, candidate("PT-1", { anc: 3000 })], [site("NCT00000001", 5)], ASOF);
    expect(a.pairs.map((p) => p.patientId)).toEqual(["PT-1"]);
  });

  it("still matches a patient whose criteria are UNKNOWN — unknowns are candidates", () => {
    const a = match([candidate("PT-SILENT")], [site("NCT00000001", 1)], ASOF);
    expect(a.enrolled).toBe(1);
  });
});

describe("patient preferences — travel, then phase", () => {
  it("sends a patient to the nearer site", () => {
    const a = match(
      [candidate("PT-1", { anc: 3000 })],
      [site("NCT00000001", 1, { siteDistanceMinutes: 120 }), site("NCT00000002", 1, { siteDistanceMinutes: 15 })],
      ASOF,
    );
    expect(a.pairs).toEqual([{ patientId: "PT-1", nctId: "NCT00000002" }]);
  });

  it("breaks a travel tie on the later phase by default", () => {
    const a = match(
      [candidate("PT-1", { anc: 3000 })],
      [
        site("NCT00000001", 1, { siteDistanceMinutes: 30, phase: "PHASE1" }),
        site("NCT00000002", 1, { siteDistanceMinutes: 30, phase: "PHASE3" }),
      ],
      ASOF,
    );
    expect(a.pairs[0].nctId).toBe("NCT00000002");
  });

  it("breaks it the other way when the cohort wants novel agents", () => {
    const a = match(
      [candidate("PT-1", { anc: 3000 })],
      [
        site("NCT00000001", 1, { siteDistanceMinutes: 30, phase: "PHASE1" }),
        site("NCT00000002", 1, { siteDistanceMinutes: 30, phase: "PHASE3" }),
      ],
      ASOF,
      { phasePreference: "earlier" },
    );
    expect(a.pairs[0].nctId).toBe("NCT00000001");
  });

  it("falls back to a displaced patient's next choice", () => {
    // Both want the near site; it holds one. The loser takes the far one.
    const near = site("NCT00000001", 1, { siteDistanceMinutes: 10 });
    const far = site("NCT00000002", 1, { siteDistanceMinutes: 200 });
    const a = match([candidate("PT-WEAK"), candidate("PT-STRONG", { anc: 3000 })], [near, far], ASOF);
    expect(seatsOf(a, "NCT00000001")).toEqual(["PT-STRONG"]);
    expect(seatsOf(a, "NCT00000002")).toEqual(["PT-WEAK"]);
    expect(a.enrolled).toBe(2);
  });
});

describe("stability", () => {
  const cohort = [
    candidate("PT-1", { anc: 3000, travelMinutes: 10 }),
    candidate("PT-2", { anc: 2000 }),
    candidate("PT-3"),
    candidate("PT-4", { anc: 1600 }),
  ];
  const sites = [
    site("NCT00000001", 1, { siteDistanceMinutes: 10 }),
    site("NCT00000002", 2, { siteDistanceMinutes: 40 }),
    site("NCT00000003", 1, { siteDistanceMinutes: 90 }),
  ];

  it("leaves no blocking pair", () => {
    expect(match(cohort, sites, ASOF).unstablePairs).toBe(0);
  });

  it("is stable however the cohort is ordered", () => {
    const shuffles = [cohort, [...cohort].reverse(), [cohort[2], cohort[0], cohort[3], cohort[1]]];
    for (const order of shuffles) {
      expect(match(order, sites, ASOF).unstablePairs, JSON.stringify(order.map((p) => p.id))).toBe(0);
    }
  });

  it("is stable when everyone wants the same oversubscribed site", () => {
    const one = [site("NCT00000001", 1, { siteDistanceMinutes: 5 })];
    const a = match(cohort, one, ASOF);
    expect(a.enrolled).toBe(1);
    expect(a.unstablePairs).toBe(0);
  });

  it("is stable with more slots than patients", () => {
    expect(match(cohort, [site("NCT00000001", 99, { siteDistanceMinutes: 5 })], ASOF).unstablePairs).toBe(0);
  });

  it("finds the blocking pairs that first-come screening leaves behind", () => {
    // PT-1 is screened first and takes the only near slot; PT-2 is the better
    // candidate and would rather be there, and the trial would rather have them.
    const weakFirst = [candidate("PT-1"), candidate("PT-2", { anc: 3000 })];
    const sitesTwo = [
      site("NCT00000001", 1, { siteDistanceMinutes: 10 }),
      site("NCT00000002", 1, { siteDistanceMinutes: 200 }),
    ];
    const adhoc = matchAdhoc(weakFirst, sitesTwo, ASOF);
    expect(adhoc.mode).toBe("adhoc");
    expect(adhoc.unstablePairs).toBeGreaterThan(0);
    expect(match(weakFirst, sitesTwo, ASOF).unstablePairs).toBe(0);
  });

  it("enrols at least as many as first-come screening does", () => {
    expect(match(cohort, sites, ASOF).enrolled).toBeGreaterThanOrEqual(
      matchAdhoc(cohort, sites, ASOF).enrolled,
    );
  });
});

describe("the assignment", () => {
  const cohort = [
    candidate("PT-1", { anc: 3000, race: "White" }),
    candidate("PT-2", { anc: 2900, race: "Black or African American" }),
  ];
  const sites = [site("NCT00000001", 2, { siteDistanceMinutes: 20 })];

  it("reports the mode", () => {
    expect(match(cohort, sites, ASOF).mode).toBe("stable");
    expect(match(cohort, sites, ASOF, { dapTargets: true }).mode).toBe("stable_dap");
  });

  it("reports mean travel over the matched pairs", () => {
    expect(match(cohort, sites, ASOF).meanTravelMinutes).toBe(20);
  });

  it("reports zero mean travel when nobody is matched", () => {
    expect(match([], sites, ASOF).meanTravelMinutes).toBe(0);
  });

  it("ignores unknown travel rather than letting it poison the mean", () => {
    const a = match(cohort, [site("NCT00000001", 2)], ASOF);
    expect(Number.isFinite(a.meanTravelMinutes)).toBe(true);
    expect(a.meanTravelMinutes).toBe(0);
  });

  it("reports subgroup shares that sum to one", () => {
    const a = match(cohort, sites, ASOF);
    expect(Object.values(a.subgroupShare!).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(a.subgroupShare).toEqual({ White: 0.5, "Black or African American": 0.5 });
  });

  it("returns an Assignment the frozen schema accepts", () => {
    expect(() => AssignmentSchema.parse(match(cohort, sites, ASOF))).not.toThrow();
    expect(() => AssignmentSchema.parse(matchAdhoc(cohort, sites, ASOF))).not.toThrow();
  });

  it("is deterministic and does not mutate its inputs", () => {
    const before = JSON.stringify([cohort, sites]);
    expect(match(cohort, sites, ASOF)).toEqual(match(cohort, sites, ASOF));
    expect(JSON.stringify([cohort, sites])).toBe(before);
  });

  it("is empty-input safe", () => {
    expect(match([], [], ASOF)).toMatchObject({ enrolled: 0, unstablePairs: 0, pairs: [] });
  });
});

describe("DAP-constrained mode", () => {
  // Four strong White candidates and one weaker Black candidate for two slots.
  // On rank alone the two White patients take both seats.
  const cohort = [
    candidate("PT-W1", { anc: 3000, race: "White" }),
    candidate("PT-W2", { anc: 2900, race: "White" }),
    candidate("PT-B1", { race: "Black or African American" }), // silent ANC → one unknown
  ];
  const plain = site("NCT00000001", 2, { siteDistanceMinutes: 20 });
  const withTargets = site("NCT00000001", 2, {
    siteDistanceMinutes: 20,
    dapTargets: { "Black or African American": 0.5 },
  });

  it("seats the top-ranked patients when the constraint is off", () => {
    expect(seatsOf(match(cohort, [withTargets], ASOF), "NCT00000001")).toEqual(["PT-W1", "PT-W2"]);
  });

  it("lets an under-target patient displace an at-target one when it is on", () => {
    const seats = seatsOf(match(cohort, [withTargets], ASOF, { dapTargets: true }), "NCT00000001");
    expect(seats).toContain("PT-B1");
    expect(seats).toHaveLength(2);
  });

  it("moves the subgroup share towards the target", () => {
    const off = match(cohort, [withTargets], ASOF).subgroupShare!;
    const on = match(cohort, [withTargets], ASOF, { dapTargets: true }).subgroupShare!;
    expect(off["Black or African American"] ?? 0).toBe(0);
    expect(on["Black or African American"]).toBeCloseTo(0.5, 10);
  });

  it("prices the constraint in blocking pairs rather than hiding the cost", () => {
    const on = match(cohort, [withTargets], ASOF, { dapTargets: true });
    expect(on.mode).toBe("stable_dap");
    expect(on.unstablePairs).toBeGreaterThan(0);
  });

  it("does nothing when the trial filed no targets", () => {
    expect(match(cohort, [plain], ASOF, { dapTargets: true })).toMatchObject({
      pairs: match(cohort, [plain], ASOF).pairs,
      unstablePairs: 0,
    });
  });

  it("stops displacing once the target is met", () => {
    // Two Black candidates for two slots against a 50% target: the constraint
    // is satisfied by one seat and must not take both on that basis.
    const two = [
      candidate("PT-W1", { anc: 3000, race: "White" }),
      candidate("PT-W2", { anc: 2900, race: "White" }),
      candidate("PT-B1", { race: "Black or African American" }),
      candidate("PT-B2", { race: "Black or African American" }),
    ];
    const seats = seatsOf(match(two, [withTargets], ASOF, { dapTargets: true }), "NCT00000001");
    expect(seats.filter((id) => id.startsWith("PT-B"))).toHaveLength(1);
    expect(seats.filter((id) => id.startsWith("PT-W"))).toHaveLength(1);
  });

  it("does not displace anyone while seats are still free", () => {
    const roomy = site("NCT00000001", 5, {
      siteDistanceMinutes: 20,
      dapTargets: { "Black or African American": 0.5 },
    });
    expect(match(cohort, [roomy], ASOF, { dapTargets: true }).enrolled).toBe(3);
  });

  it("never drops the enrolled count to hit a target", () => {
    const on = match(cohort, [withTargets], ASOF, { dapTargets: true });
    const off = match(cohort, [withTargets], ASOF);
    expect(on.enrolled).toBe(off.enrolled);
  });

  it("is deterministic under the constraint", () => {
    expect(match(cohort, [withTargets], ASOF, { dapTargets: true })).toEqual(
      match(cohort, [withTargets], ASOF, { dapTargets: true }),
    );
  });
});

describe("cited priors reach the matching", () => {
  const table = buildPriorTable([
    {
      id: "kras-mutation",
      biomarker: "KRAS",
      alteration: "mutation",
      prevalence: 0.2887,
      population: "9,450 NSCLC specimens",
      citation: "Huang 2021",
    },
  ]);

  const withMarker = leaf({
    id: "INC-kras",
    predicate: "biomarker",
    analyte: "KRAS",
    operator: "==",
    value: "mutation",
    tier: 0,
    pFavorable: 0.01,
    sourceSpan: "KRAS mutation",
  });

  it("puts the cited prior on the cells the matching ranks on", () => {
    const t = trial({ nctId: "NCT00000001", slots: 1, siteDistanceMinutes: 20, criteria: [adult, withMarker] });
    const cohort = [candidate("PT-1"), candidate("PT-2")];
    const a = match(cohort, [t], ASOF, { priors: table });
    expect(a.enrolled).toBe(1);
    // Same market, same winner — but the expectedValue the trial ranked on is
    // now the cited 0.2887 rather than the compiler's 0.01.
    expect(match(cohort, [t], ASOF).enrolled).toBe(1);
  });

  it("stays stable with priors wired in", () => {
    const sites = [
      trial({ nctId: "NCT00000001", slots: 1, siteDistanceMinutes: 10, criteria: [adult, withMarker] }),
      trial({ nctId: "NCT00000002", slots: 1, siteDistanceMinutes: 90, criteria: [adult, withMarker] }),
    ];
    const cohort = [candidate("PT-1"), candidate("PT-2"), candidate("PT-3")];
    expect(match(cohort, sites, ASOF, { priors: table }).unstablePairs).toBe(0);
  });
});
