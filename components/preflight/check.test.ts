import { expect, test } from "vitest";
import { z } from "zod";
import { checkPayload, countRows, ready } from "./check";

const Arr = z.array(z.object({ id: z.string() }));

test("missing required is red", () => {
  const c = checkPayload({ path: "x.json", required: true, raw: null, schema: Arr });
  expect(c.ok).toBe(false);
  expect(c.exists).toBe(false);
  expect(c.error).toBe("missing");
});

test("missing optional is not a blocker", () => {
  const c = checkPayload({ path: "x.json", required: false, raw: null, schema: Arr });
  expect(c.ok).toBe(true);
  expect(c.error).toMatch(/fallback/);
});

test("valid non-empty array is green", () => {
  const c = checkPayload({
    path: "x.json",
    required: true,
    raw: JSON.stringify([{ id: "a" }, { id: "b" }]),
    schema: Arr,
  });
  expect(c.ok).toBe(true);
  expect(c.rows).toBe(2);
});

test("empty array is red", () => {
  const c = checkPayload({ path: "x.json", required: true, raw: "[]", schema: Arr });
  expect(c.ok).toBe(false);
  expect(c.error).toBe("empty");
});

test("schema miss is red", () => {
  const c = checkPayload({ path: "x.json", required: true, raw: "[{}]", schema: Arr });
  expect(c.ok).toBe(false);
  expect(c.error).toMatch(/required|invalid|expected/i);
});

test("countRows understands landscape and eval shapes", () => {
  expect(countRows({ analytes: [1, 2, 3] })).toBe(3);
  expect(countRows({ evaluatedCells: 130 })).toBe(130);
  expect(countRows({ settled: [1], needs: [2, 3] })).toBe(3);
  expect(countRows({ beneficiaries: 1296, settled: [], needs: [] })).toBe(1296);
  expect(countRows({ patients: 203 })).toBe(203);
});

test("ready ignores optional failures", () => {
  expect(
    ready([
      { path: "a", required: true, exists: true, ok: true, rows: 1 },
      { path: "b", required: false, exists: false, ok: false, rows: 0, error: "missing" },
    ]),
  ).toBe(true);
  expect(ready([{ path: "a", required: true, exists: true, ok: false, rows: 0 }])).toBe(false);
});
