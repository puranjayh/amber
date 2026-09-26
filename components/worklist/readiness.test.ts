import { expect, test } from "vitest";
import { readiness, spread, trialReady } from "./readiness";

test("readiness buckets match the coordinator bar", () => {
  expect(readiness({ eliminated: false, unknownCount: 0 })).toBe("eligible");
  expect(readiness({ eliminated: false, unknownCount: 1 })).toBe("one");
  expect(readiness({ eliminated: false, unknownCount: 3 })).toBe("several");
  expect(readiness({ eliminated: true, unknownCount: 0 })).toBe("eliminated");
});

test("trial-ready is eligible now — zero unknowns, not eliminated", () => {
  expect(trialReady({ eliminated: false, unknownCount: 0 })).toBe(true);
  expect(trialReady({ eliminated: false, unknownCount: 1 })).toBe(false);
  expect(trialReady({ eliminated: true, unknownCount: 0 })).toBe(false);
});

test("spread totals the four buckets", () => {
  expect(
    spread([
      { eliminated: false, unknownCount: 0 },
      { eliminated: false, unknownCount: 1 },
      { eliminated: false, unknownCount: 2 },
      { eliminated: false, unknownCount: 4 },
      { eliminated: true, unknownCount: 1 },
    ]),
  ).toEqual({ eligible: 1, one: 1, several: 2, eliminated: 1 });
});
