import { describe, expect, test } from "vitest";
import cubeJson from "@/fixtures/cube.sample.json";
import patientsJson from "@/fixtures/patients.sample.json";
import trialsJson from "@/fixtures/trials.sample.json";
import {
  CubeFixture,
  PatientsFixture,
  TrialsFixture,
  type CriterionLeaf,
  type CubeCell,
  type PairResult,
} from "@/src/contracts";
import { blockingUnknown, orderFor, pickAlertPair } from "./alert";

const cube = CubeFixture.parse(cubeJson);
const patients = PatientsFixture.parse(patientsJson);
const trials = TrialsFixture.parse(trialsJson);

const pair = (over: Partial<PairResult>): PairResult => ({
  patientId: "PT-1",
  nctId: "NCT00000001",
  eliminated: false,
  passCount: 0,
  failCount: 0,
  unknownCount: 1,
  resolutionCost: 1,
  expectedValue: 0,
  cells: [],
  ...over,
});

const unknown = (criterionId: string, tier: CubeCell["tier"], pFavorable?: number): CubeCell => ({
  patientId: "PT-1",
  nctId: "NCT00000001",
  criterionId,
  verdict: "UNKNOWN",
  reason: "absent",
  criterionCitation: "x",
  tier,
  pFavorable,
});

describe("pickAlertPair", () => {
  test("never alerts on an eliminated pair or one with nothing unknown", () => {
    expect(pickAlertPair([pair({ eliminated: true }), pair({ unknownCount: 0 })])).toBeUndefined();
  });

  test("prefers one open question over several, then expected value", () => {
    const one = pair({ nctId: "NCT00000002", unknownCount: 1, expectedValue: 0.1 });
    const two = pair({ nctId: "NCT00000003", unknownCount: 2, expectedValue: 0.9 });
    const oneBetter = pair({ nctId: "NCT00000004", unknownCount: 1, expectedValue: 0.4 });
    expect(pickAlertPair([two, one, oneBetter])).toBe(oneBetter);
  });

  test("on the sample cube it surfaces PT-4401 × NCT07001003, the single-unknown pair", () => {
    const picked = pickAlertPair(cube);
    expect([picked?.patientId, picked?.nctId]).toEqual(["PT-4401", "NCT07001003"]);
  });
});

describe("blockingUnknown", () => {
  test("ranks by pFavorable per tier weight, cheaper tier on ties", () => {
    const p = pair({ cells: [unknown("A", 0, 0.2), unknown("B", 1, 0.6), unknown("C", 3, 0.9)] });
    expect(blockingUnknown(p)?.criterionId).toBe("B");
    const tie = pair({ cells: [unknown("X", 1), unknown("Y", 0)] });
    expect(blockingUnknown(tie)?.criterionId).toBe("Y");
  });

  test("ignores cells that are not UNKNOWN", () => {
    const pass = { ...unknown("P", 0, 1), verdict: "PASS" as const, reason: "satisfied" as const };
    expect(blockingUnknown(pair({ cells: [pass] }))).toBeUndefined();
  });
});

describe("orderFor", () => {
  const leafOf = (nctId: string, id: string) => {
    const trial = trials.find((t) => t.nctId === nctId)!;
    return trial.criteria.find((c) => c.kind === "leaf" && c.id === id) as CriterionLeaf;
  };
  const hero = patients.find((p) => p.id === "PT-4401")!;
  const cellOf = (patientId: string, nctId: string, id: string) =>
    cube.find((p) => p.patientId === patientId && p.nctId === nctId)!.cells.find((c) => c.criterionId === id)!;

  test("a stale ECOG becomes an in-clinic assessment with its window", () => {
    const order = orderFor(leafOf("NCT07001003", "INC-4"), cellOf("PT-4401", "NCT07001003", "INC-4"), hero);
    expect(order.title).toBe("Document ECOG at the next visit");
    expect(order.detail).toContain("within 14 days");
  });

  test("an untested tier-0 biomarker points at the archived specimen", () => {
    const order = orderFor(leafOf("NCT07001001", "INC-3"), cellOf("PT-4401", "NCT07001001", "INC-3"), hero);
    expect(order.title).toBe("EGFR mutation testing on archived tissue");
    expect(order.detail).toContain("pathology 2026-05-14");
  });

  test("stale counts map to a CBC", () => {
    const pt = patients.find((p) => p.id === "PT-4408")!;
    const order = orderFor(leafOf("NCT07001001", "INC-5"), cellOf("PT-4408", "NCT07001001", "INC-5"), pt);
    expect(order.title).toBe("CBC with differential");
  });
});
