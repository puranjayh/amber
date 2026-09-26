import { expect, test } from "vitest";
import { EquityRow } from "@/src/contracts";
import sample from "@/app/_data/equity.sample.json";
import { buildEquityView, gapPoints } from "./equity";

const rows = EquityRow.array().parse(sample);

test("rows sort by gap, largest first", () => {
  const view = buildEquityView(rows);
  expect(view.rows.map((r) => r.maxGapPoints)).toEqual(
    [...rows.map((r) => r.maxGapPoints)].sort((a, b) => b - a),
  );
  expect(view.rows[0].criterionId).toBe("INC-5");
});

test("worst and best subgroup are named per row", () => {
  const anc = buildEquityView(rows).rows[0];
  expect(anc.worst).toBe("Black or African American");
  expect(anc.best).toBe("Asian");
});

test("gapPoints is max minus min in percentage points", () => {
  expect(gapPoints({ a: 0.05, b: 0.21 })).toBe(16);
  expect(gapPoints({ a: 0.3 })).toBe(0);
});

test("the placeholder's maxGapPoints agree with its own rates", () => {
  for (const r of rows) expect(r.maxGapPoints).toBe(gapPoints(r.exclusionRateBySubgroup));
});
