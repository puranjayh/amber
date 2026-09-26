import { describe, expect, test } from "vitest";
import { BEATS, advance, isAdvanceKey, isRetreatKey, revealedThrough, retreat } from "./beats";

test("four beats, in story order", () => {
  expect([...BEATS]).toEqual(["worklist", "hcp", "elasticity", "payer"]);
});

test("advance and retreat clamp", () => {
  expect(advance(0)).toBe(1);
  expect(advance(3)).toBe(3);
  expect(retreat(0)).toBe(0);
  expect(retreat(3)).toBe(2);
});

test("exiting presenter reveals the whole page", () => {
  expect(revealedThrough(0, true)).toBe(0);
  expect(revealedThrough(1, true)).toBe(1);
  expect(revealedThrough(0, false)).toBe(3);
});

describe("keys", () => {
  test("space and arrows advance", () => {
    expect(isAdvanceKey(" ")).toBe(true);
    expect(isAdvanceKey("ArrowRight")).toBe(true);
    expect(isRetreatKey("ArrowLeft")).toBe(true);
    expect(isAdvanceKey("Escape")).toBe(false);
  });
});
