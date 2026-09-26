import { describe, expect, it } from "vitest";
import type { PairResult } from "@/src/contracts";
import { compareCandidates, rank, rankPatientsForTrial, rankTrialsForPatient, travelMinutesFor } from "./rank";
import { fact, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/** A bare roll-up; the ranker only reads the summary fields, never the cells. */
const pair = (over: Partial<PairResult> & Pick<PairResult, "nctId">): PairResult => ({
  patientId: "PT-1",
  eliminated: false,
  passCount: 0,
  failCount: 0,
  unknownCount: 0,
  resolutionCost: 0,
  expectedValue: 0,
  cells: [],
  ...over,
});

const ids = (rs: readonly PairResult[]) => rs.map((r) => r.nctId);
const noTravel = () => Number.POSITIVE_INFINITY;

describe("rank", () => {
  it("drops eliminated pairs rather than sorting them to the bottom", () => {
    const out = rank([
      pair({ nctId: "NCT00000001", eliminated: true }),
      pair({ nctId: "NCT00000002" }),
    ]);
    expect(ids(out)).toEqual(["NCT00000002"]);
  });

  it("returns nothing when every pair is eliminated", () => {
    expect(rank([pair({ nctId: "NCT00000001", eliminated: true })])).toEqual([]);
  });

  it("sorts by fewest unknowns first", () => {
    const out = rank([
      pair({ nctId: "NCT00000003", unknownCount: 9 }),
      pair({ nctId: "NCT00000001", unknownCount: 1 }),
      pair({ nctId: "NCT00000002", unknownCount: 4 }),
    ]);
    expect(ids(out)).toEqual(["NCT00000001", "NCT00000002", "NCT00000003"]);
  });

  it("prefers fewer unknowns even when a busier pair looks more promising", () => {
    // One phone call beats nine, however good the nine look.
    const out = rank([
      pair({ nctId: "NCT00000002", unknownCount: 9, expectedValue: 5 }),
      pair({ nctId: "NCT00000001", unknownCount: 1, expectedValue: 0.01 }),
    ]);
    expect(ids(out)).toEqual(["NCT00000001", "NCT00000002"]);
  });

  it("breaks an unknowns tie on higher expectedValue", () => {
    const out = rank([
      pair({ nctId: "NCT00000001", unknownCount: 2, expectedValue: 0.1 }),
      pair({ nctId: "NCT00000002", unknownCount: 2, expectedValue: 0.9 }),
    ]);
    expect(ids(out)).toEqual(["NCT00000002", "NCT00000001"]);
  });

  it("breaks an expectedValue tie on shorter travel", () => {
    const ctx = {
      patients: [patient({ id: "PT-1" })],
      trials: [
        trial({ nctId: "NCT00000001", siteDistanceMinutes: 200 }),
        trial({ nctId: "NCT00000002", siteDistanceMinutes: 20 }),
      ],
    };
    const out = rank(
      [pair({ nctId: "NCT00000001", unknownCount: 2 }), pair({ nctId: "NCT00000002", unknownCount: 2 })],
      ctx,
    );
    expect(ids(out)).toEqual(["NCT00000002", "NCT00000001"]);
  });

  it("applies the three keys in the specified order", () => {
    const ctx = {
      patients: [patient({ id: "PT-1" })],
      trials: [
        trial({ nctId: "NCT00000001", siteDistanceMinutes: 5 }),
        trial({ nctId: "NCT00000002", siteDistanceMinutes: 300 }),
        trial({ nctId: "NCT00000003", siteDistanceMinutes: 5 }),
      ],
    };
    const out = rank(
      [
        // nearest, but two unknowns
        pair({ nctId: "NCT00000001", unknownCount: 2, expectedValue: 9 }),
        // one unknown, far away, low value
        pair({ nctId: "NCT00000002", unknownCount: 1, expectedValue: 0.1 }),
        // one unknown, near, higher value
        pair({ nctId: "NCT00000003", unknownCount: 1, expectedValue: 0.2 }),
      ],
      ctx,
    );
    expect(ids(out)).toEqual(["NCT00000003", "NCT00000002", "NCT00000001"]);
  });

  it("is total — full ties resolve on id, identically every run", () => {
    const a = pair({ nctId: "NCT00000002", patientId: "PT-2" });
    const b = pair({ nctId: "NCT00000001", patientId: "PT-1" });
    const c = pair({ nctId: "NCT00000001", patientId: "PT-2" });
    const once = rank([a, b, c]).map((r) => `${r.nctId}/${r.patientId}`);
    expect(once).toEqual(["NCT00000001/PT-1", "NCT00000001/PT-2", "NCT00000002/PT-2"]);
    expect(rank([c, a, b]).map((r) => `${r.nctId}/${r.patientId}`)).toEqual(once);
    expect(rank([b, c, a]).map((r) => `${r.nctId}/${r.patientId}`)).toEqual(once);
  });

  it("does not mutate or reorder the caller's array — the cube is shared", () => {
    const input = [pair({ nctId: "NCT00000002" }), pair({ nctId: "NCT00000001" })];
    const snapshot = ids(input);
    rank(input);
    expect(ids(input)).toEqual(snapshot);
  });

  it("sorts a pair with unknown travel last rather than promoting it", () => {
    const ctx = {
      patients: [patient({ id: "PT-1" })],
      trials: [trial({ nctId: "NCT00000001" }), trial({ nctId: "NCT00000002", siteDistanceMinutes: 90 })],
    };
    const out = rank([pair({ nctId: "NCT00000001" }), pair({ nctId: "NCT00000002" })], ctx);
    expect(ids(out)).toEqual(["NCT00000002", "NCT00000001"]);
  });
});

describe("travelMinutesFor", () => {
  it("prefers the trial's own site distance over the patient's general burden", () => {
    expect(travelMinutesFor(patient({ travelMinutes: 90 }), trial({ siteDistanceMinutes: 20 }))).toBe(20);
  });

  it("falls back to the patient's travel burden", () => {
    expect(travelMinutesFor(patient({ travelMinutes: 90 }), trial())).toBe(90);
  });

  it("is infinite when nobody knows", () => {
    expect(travelMinutesFor(patient(), trial())).toBe(Number.POSITIVE_INFINITY);
    expect(travelMinutesFor(undefined, undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("compareCandidates", () => {
  it("is antisymmetric", () => {
    const a = pair({ nctId: "NCT00000001", unknownCount: 1 });
    const b = pair({ nctId: "NCT00000002", unknownCount: 3 });
    expect(Math.sign(compareCandidates(a, b, noTravel))).toBe(-Math.sign(compareCandidates(b, a, noTravel)));
  });

  it("is zero only for the same pair", () => {
    const a = pair({ nctId: "NCT00000001" });
    expect(compareCandidates(a, a, noTravel)).toBe(0);
    expect(compareCandidates(a, pair({ nctId: "NCT00000002" }), noTravel)).not.toBe(0);
  });
});

describe("both axes of the cube", () => {
  const anc = leaf({ id: "INC-1", analyte: "ANC", operator: ">=", value: 1500, unit: "/uL", maxAgeDays: 14, tier: 1 });
  const adult = leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 });
  const t = (nctId: string, siteDistanceMinutes?: number) =>
    trial({ nctId, siteDistanceMinutes, criteria: [adult, anc] });

  const resolved = patient({
    id: "PT-RESOLVED",
    age: 60,
    facts: [fact({ analyte: "ANC", value: 3000, unit: "/uL", observedAt: "2026-09-22" })],
  });
  const silent = patient({ id: "PT-SILENT", age: 60 });
  const child = patient({ id: "PT-CHILD", age: 9 });

  it("ranks a patient's trials, nearest first when the criteria tie", () => {
    const out = rankTrialsForPatient(resolved, [t("NCT00000001", 120), t("NCT00000002", 15)], ASOF);
    expect(ids(out)).toEqual(["NCT00000002", "NCT00000001"]);
  });

  it("ranks a trial's candidates, the resolved patient ahead of the silent one", () => {
    const out = rankPatientsForTrial(t("NCT00000001", 30), [silent, resolved], ASOF);
    expect(out.map((r) => r.patientId)).toEqual(["PT-RESOLVED", "PT-SILENT"]);
  });

  it("leaves an eliminated candidate off the worklist entirely", () => {
    const out = rankPatientsForTrial(t("NCT00000001", 30), [child, resolved, silent], ASOF);
    expect(out.map((r) => r.patientId)).toEqual(["PT-RESOLVED", "PT-SILENT"]);
  });

  it("orders the two axes with the same comparator", () => {
    // The trial's view of these two patients must not contradict itself.
    const forTrial = rankPatientsForTrial(t("NCT00000001", 30), [silent, resolved], ASOF);
    expect(forTrial[0].unknownCount).toBeLessThanOrEqual(forTrial[1].unknownCount);
  });
});
