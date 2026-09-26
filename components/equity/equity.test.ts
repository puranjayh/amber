import { expect, test } from "vitest";
import type { EquityRow } from "@/src/contracts";
import { buildEquityView, gapPoints } from "./equity";

const row = (criterionId: string, rates: Record<string, number>): EquityRow => ({
  criterionId,
  label: criterionId,
  exclusionRateBySubgroup: rates,
  maxGapPoints: gapPoints(rates),
});

const rows = [
  row("A", { X: 0.1, Y: 0.12 }),
  row("B", { X: 0.05, Y: 0.21, Z: 0.07 }),
  row("C", { X: 0, Y: 0 }),
];

test("rows sort by gap, largest first", () => {
  expect(buildEquityView(rows).rows.map((r) => r.criterionId)).toEqual(["B", "A", "C"]);
});

test("worst and best subgroup are named per row", () => {
  const b = buildEquityView(rows).rows[0];
  expect([b.worst, b.best]).toEqual(["Y", "X"]);
});

test("subgroups are the union across rows", () => {
  expect(buildEquityView(rows).subgroups).toEqual(["X", "Y", "Z"]);
});

test("gapPoints is max minus min in percentage points", () => {
  expect(gapPoints({ a: 0.05, b: 0.21 })).toBe(16);
  expect(gapPoints({ a: 0.3 })).toBe(0);
});
