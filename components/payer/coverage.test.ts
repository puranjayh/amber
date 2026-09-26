import { expect, test } from "vitest";
import {
  SLIDE_CRITERIA,
  assertSlideCoverage,
  isCompileStats,
  kindOf,
  pct1,
  readClaimsCoverage,
} from "./coverage";

const published = {
  trials: 233,
  criteria: SLIDE_CRITERIA,
  answerable: 2776,
  ambiguous: 875,
  lowerRate: 0.544,
  upperRate: 0.715,
  inclusions: { count: 1, answerable: 0, rate: 0.452 },
  exclusions: { count: 1, answerable: 1, rate: 0.624 },
  byPredicate: [{ predicate: "prior_therapy", count: 1, answerable: 1, rate: 1, kind: "certain" as const }],
};

test("washout and contraindication are the ambiguous set", () => {
  expect(kindOf("prior_therapy")).toBe("certain");
  expect(kindOf("washout")).toBe("ambiguous");
  expect(kindOf("lab_value")).toBe("never");
});

test("compile-stats is not claims coverage — wait, do not invent a number", () => {
  const stats = { compiledTrials: 233, rejectedTrials: 67, demoPoolTrials: 0 };
  expect(isCompileStats(stats)).toBe(true);
  expect(readClaimsCoverage(stats, "data/compiled/coverage.json")).toBeNull();
});

test("published figure with the slide leaf count is accepted", () => {
  const coverage = readClaimsCoverage(published, "data/compiled/coverage.json");
  expect(coverage?.criteria).toBe(5103);
  expect(coverage?.source).toBe("data/compiled/coverage.json");
  expect(pct1(coverage!.lowerRate)).toBe("54.4%");
});

test("a different leaf count fails loudly", () => {
  expect(() => assertSlideCoverage({ criteria: 5105 }, "data/compiled/coverage.json")).toThrow(
    /5,105 criteria; slides say 5,103/,
  );
  expect(() => readClaimsCoverage({ ...published, criteria: 5105 }, "data/compiled/coverage.json")).toThrow(
    /Refusing to show a different number/,
  );
});

test("an unknown shape fails loudly rather than walking trees", () => {
  expect(() => readClaimsCoverage({ trials: 233 }, "data/compiled/coverage.json")).toThrow(
    /Refusing to compute a figure from the trees/,
  );
});
