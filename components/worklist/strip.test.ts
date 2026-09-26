import { expect, test } from "vitest";
import type { CubeCell, PairResult } from "@/src/contracts";
import { formatBench, MEASURED_BENCH, screenFailures, worklistStrip } from "./strip";

function cell(over: Partial<CubeCell> & Pick<CubeCell, "criterionId" | "verdict">): CubeCell {
  return {
    patientId: "PT-1",
    nctId: "NCT-1",
    reason: over.verdict === "UNKNOWN" ? "absent" : "satisfied",
    criterionCitation: "protocol text",
    tier: 0,
    ...over,
  };
}

function pair(over: Partial<PairResult> & Pick<PairResult, "cells">): PairResult {
  const unknownCount = over.cells.filter((c) => c.verdict === "UNKNOWN").length;
  return {
    patientId: "PT-1",
    nctId: "NCT-1",
    eliminated: false,
    passCount: over.cells.length - unknownCount,
    failCount: 0,
    unknownCount,
    resolutionCost: 0,
    expectedValue: 0,
    ...over,
  };
}

test("pairs evaluated is the size of the cube", () => {
  const a = pair({ cells: [cell({ criterionId: "INC-1", verdict: "PASS" })] });
  expect(worklistStrip([a, { ...a, patientId: "PT-2" }]).pairsEvaluated).toBe(2);
  expect(worklistStrip([]).pairsEvaluated).toBe(0);
});

test("eligible now: not eliminated, zero unknowns", () => {
  const ready = pair({ cells: [cell({ criterionId: "INC-1", verdict: "PASS" })] });
  const unknown = pair({
    cells: [cell({ criterionId: "INC-1", verdict: "UNKNOWN", tier: 0 })],
  });
  const eliminated = pair({
    eliminated: true,
    cells: [cell({ criterionId: "EXC-1", verdict: "PASS" })],
  });
  expect(worklistStrip([ready, unknown, eliminated]).eligibleNow).toBe(1);
});

test("one Tier-0 away: exactly one remaining unknown, and it is tier 0", () => {
  const one = pair({
    cells: [cell({ criterionId: "INC-3", verdict: "UNKNOWN", tier: 0 })],
  });
  const twoTier0 = pair({
    patientId: "PT-2",
    cells: [
      cell({ criterionId: "INC-3", verdict: "UNKNOWN", tier: 0 }),
      cell({ criterionId: "INC-7", verdict: "UNKNOWN", tier: 0 }),
    ],
  });
  const tier1 = pair({
    patientId: "PT-3",
    cells: [cell({ criterionId: "INC-4", verdict: "UNKNOWN", tier: 1 })],
  });
  const mixed = pair({
    patientId: "PT-4",
    cells: [
      cell({ criterionId: "INC-3", verdict: "UNKNOWN", tier: 0 }),
      cell({ criterionId: "INC-4", verdict: "UNKNOWN", tier: 1 }),
    ],
  });
  expect(worklistStrip([one, twoTier0, tier1, mixed]).oneTier0Away).toBe(1);
});

test("eliminated pairs never count as eligible or one-Tier-0-away", () => {
  const eliminatedReady = pair({
    eliminated: true,
    cells: [cell({ criterionId: "EXC-1", verdict: "PASS" })],
  });
  const eliminatedUnknown = pair({
    eliminated: true,
    cells: [cell({ criterionId: "INC-3", verdict: "UNKNOWN", tier: 0 })],
  });
  expect(worklistStrip([eliminatedReady, eliminatedUnknown])).toEqual({
    pairsEvaluated: 2,
    eligibleNow: 0,
    oneTier0Away: 0,
  });
});

test("screen-failures-avoided: 62% baseline minus true eliminations, times $2,000", () => {
  const rows = Array.from({ length: 203 }, (_, i) => ({ eliminated: i < 4 }));
  expect(screenFailures(rows)).toEqual({
    patientsScreened: 203,
    expectedFailures: 126,
    failuresAvoided: 122,
    dollarsAvoided: 244_000,
  });
});

test("bench line says measured, not up to", () => {
  const line = formatBench(MEASURED_BENCH);
  expect(line).toMatch(/^measured:/);
  expect(line).not.toMatch(/up to/i);
  expect(line).toContain("20,420,000");
  expect(line).toContain("8.76s");
  expect(line).toContain("4,000 patients × 233 trials");
});
