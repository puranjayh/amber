import { expect, test } from "vitest";
import { displayTone, toneCounts, toneMeaning } from "./tone";

test("toneCounts counts a cleared exclusion as green, not red", () => {
  const types: Record<string, "inclusion" | "exclusion"> = { I: "inclusion", E: "exclusion", U: "inclusion" };
  const counts = toneCounts(
    [
      { criterionId: "I", verdict: "PASS" },
      { criterionId: "E", verdict: "FAIL" },
      { criterionId: "U", verdict: "UNKNOWN" },
      { criterionId: "orphan", verdict: "FAIL" },
    ],
    (id) => types[id],
  );
  expect(counts).toEqual({ green: 2, red: 0, amber: 1 });
});

test("inclusion: PASS is green, FAIL is red", () => {
  expect(displayTone({ verdict: "PASS" }, "inclusion")).toBe("green");
  expect(displayTone({ verdict: "FAIL" }, "inclusion")).toBe("red");
});

test("exclusion polarity: a matched exclusion (PASS) is red, a cleared one (FAIL) is green", () => {
  expect(displayTone({ verdict: "PASS" }, "exclusion")).toBe("red");
  expect(displayTone({ verdict: "FAIL" }, "exclusion")).toBe("green");
});

test("UNKNOWN is amber regardless of criterion type", () => {
  expect(displayTone({ verdict: "UNKNOWN" }, "inclusion")).toBe("amber");
  expect(displayTone({ verdict: "UNKNOWN" }, "exclusion")).toBe("amber");
});

test("toneMeaning spells out exclusion polarity", () => {
  expect(toneMeaning("PASS", "exclusion")).toBe("patient matches this exclusion");
  expect(toneMeaning("FAIL", "exclusion")).toBe("patient clears this exclusion");
});
